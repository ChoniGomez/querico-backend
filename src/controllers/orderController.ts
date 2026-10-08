import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../config/database';

interface OrderItemInput {
  productId: number | string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

class ProductUnavailableError extends Error {}

async function loadOrders(userId?: string) {
  const whereClause = userId ? 'WHERE o.user_id = $1' : '';
  const values = userId ? [userId] : [];
  return pool.query(
    `SELECT o.id, o.order_number AS "orderNumber", COALESCE(u.name, o.customer_name) AS "customerName",
            COALESCE(u.email, o.customer_email) AS "customerEmail",
            o.delivery_type AS "deliveryType", o.address, o.payment_method AS "paymentMethod",
            o.cash_amount AS "cashAmount", o.total, o.status, o.created_at AS "createdAt",
            COALESCE(json_agg(json_build_object(
              'name', oi.product_name, 'quantity', oi.quantity, 'price', oi.unit_price,
              'discountPercent', oi.discount_percent, 'notes', oi.notes
            ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereClause}
     GROUP BY o.id, u.name, u.email ORDER BY o.created_at DESC`,
    values,
  );
}

export async function createOrder(req: AuthenticatedRequest, res: Response) {
  const { customerName, customerEmail, deliveryType, address, paymentMethod, cashAmount, items } = req.body || {};
  if (!customerName?.trim() || !['delivery', 'pickup'].includes(deliveryType)
    || !['cash', 'transfer'].includes(paymentMethod) || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Revisá los datos del pedido.' });
  }
  if (deliveryType === 'delivery' && !address?.trim()) {
    return res.status(400).json({ message: 'La dirección es obligatoria para el delivery.' });
  }
  if (!req.auth && customerEmail) {
    try {
      const account = await pool.query('SELECT is_verified AS "isVerified" FROM users WHERE email = $1', [String(customerEmail).trim().toLowerCase()]);
      if (account.rows[0] && !account.rows[0].isVerified) {
        return res.status(403).json({ message: 'Verificá tu correo antes de realizar un pedido con esta cuenta.' });
      }
    } catch (error) {
      console.error('Could not check order account verification:', error);
      return res.status(500).json({ message: 'No se pudo validar el correo del pedido.' });
    }
  }

  const validItems = (items as OrderItemInput[]).every((item) => Number.isInteger(Number(item.productId))
    && Number(item.productId) > 0 && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0);
  if (!validItems) return res.status(400).json({ message: 'Hay productos inválidos en el pedido.' });

  const requestedItems = items as OrderItemInput[];
  const quantities = new Map<number, number>();
  for (const item of requestedItems) {
    const productId = Number(item.productId);
    quantities.set(productId, (quantities.get(productId) || 0) + Number(item.quantity));
  }
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const productIds = [...quantities.keys()].sort((left, right) => left - right);
    const productResult = await client.query(
      `SELECT id, name, price::float8 AS price, is_available AS "isAvailable",
              EXISTS (SELECT 1 FROM categories c WHERE c.id = products.category_id AND c.is_visible) AS "categoryVisible",
              start_date_time AS "startDateTime", end_date_time AS "endDateTime", stock,
              promo_min_quantity AS "promoMinQuantity",
              promo_discount_percent::float8 AS "promoDiscountPercent"
       FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [productIds],
    );
    if (productResult.rowCount !== productIds.length) {
      throw new ProductUnavailableError('Uno o más productos ya no están disponibles. Actualizá el catálogo e intentá nuevamente.');
    }

    const productsById = new Map<number, { id: number; name: string; price: number; isAvailable: boolean; categoryVisible: boolean; startDateTime: Date | null; endDateTime: Date | null; stock: number | null; promoMinQuantity: number | null; promoDiscountPercent: number | null }>(
      productResult.rows.map((product) => [Number(product.id), product]),
    );
    const now = Date.now();
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)!;
      const startsLater = product.startDateTime && new Date(product.startDateTime).getTime() > now;
      const hasEnded = product.endDateTime && new Date(product.endDateTime).getTime() <= now;
      if (!product.isAvailable || !product.categoryVisible || startsLater || hasEnded) {
        throw new ProductUnavailableError(`${product.name} no está disponible en este horario.`);
      }
      if (product.stock !== null && Number(product.stock) < quantity) {
        throw new ProductUnavailableError(`No queda stock suficiente de ${product.name}.`);
      }
    }

    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)!;
      if (product.stock !== null) {
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, productId]);
      }
    }

    const discountByProduct = new Map<number, number>();
    for (const [productId, quantity] of quantities) {
      const product = productsById.get(productId)!;
      const discountApplies = product.promoMinQuantity !== null
        && product.promoDiscountPercent !== null
        && quantity >= Number(product.promoMinQuantity);
      discountByProduct.set(productId, discountApplies ? Number(product.promoDiscountPercent) : 0);
    }
    const discountedUnitPrice = (productId: number) => {
      const product = productsById.get(productId)!;
      const discount = discountByProduct.get(productId) || 0;
      return Math.round(Number(product.price) * (1 - discount / 100) * 100) / 100;
    };
    const total = requestedItems.reduce((sum, item) => {
      return sum + discountedUnitPrice(Number(item.productId)) * Number(item.quantity);
    }, 0);
    const inserted = await client.query(
      `INSERT INTO orders (user_id, customer_name, customer_email, delivery_type, address,
                           payment_method, cash_amount, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, order_number AS "orderNumber", status, created_at AS "createdAt"`,
      [req.auth?.role === 'customer' ? req.auth.id : null, customerName.trim(), req.auth?.email || customerEmail || null,
        deliveryType, address?.trim() || null, paymentMethod, cashAmount ? Number(cashAmount) : null, total],
    );
    const order = inserted.rows[0];
    for (const item of requestedItems) {
      const product = productsById.get(Number(item.productId))!;
      await client.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [order.id, product.id, product.name, Number(item.quantity), discountedUnitPrice(product.id),
          discountByProduct.get(product.id) || 0, item.notes?.trim() || null],
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ ...order, total });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof ProductUnavailableError) {
      return res.status(409).json({ message: error.message });
    }
    console.error('Order creation failed:', error);
    return res.status(500).json({ message: 'No se pudo guardar el pedido.' });
  } finally {
    client.release();
  }
}

export async function getMyOrders(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await loadOrders(req.auth!.id);
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load customer orders:', error);
    return res.status(500).json({ message: 'No se pudo cargar el historial de pedidos.' });
  }
}

export async function getAllOrders(_req: Request, res: Response) {
  try {
    const result = await loadOrders();
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load orders:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los pedidos.' });
  }
}

export async function updateOrderStatus(req: Request, res: Response) {
  const { status } = req.body || {};
  if (!['Pendiente', 'En preparación', 'Entregado'].includes(status)) {
    return res.status(400).json({ message: 'El estado solicitado no es válido.' });
  }
  try {
    const result = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, order_number AS "orderNumber", status`,
      [status, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró el pedido.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update order status:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el pedido.' });
  }
}