import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { pool } from '../config/database';

interface OrderItemInput {
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

async function loadOrders(userId?: string) {
  const whereClause = userId ? 'WHERE o.user_id = $1' : '';
  const values = userId ? [userId] : [];
  return pool.query(
    `SELECT o.id, COALESCE(u.name, o.customer_name) AS "customerName",
            COALESCE(u.email, o.customer_email) AS "customerEmail",
            o.delivery_type AS "deliveryType", o.address, o.payment_method AS "paymentMethod",
            o.cash_amount AS "cashAmount", o.total, o.status, o.created_at AS "createdAt",
            COALESCE(json_agg(json_build_object(
              'name', oi.product_name, 'quantity', oi.quantity, 'price', oi.unit_price, 'notes', oi.notes
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

  const validItems = (items as OrderItemInput[]).every((item) => item.name?.trim()
    && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0
    && Number.isFinite(Number(item.price)) && Number(item.price) >= 0);
  if (!validItems) return res.status(400).json({ message: 'Hay productos inválidos en el pedido.' });

  const total = (items as OrderItemInput[]).reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO orders (user_id, customer_name, customer_email, delivery_type, address,
                           payment_method, cash_amount, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at AS "createdAt"`,
      [req.auth?.role === 'customer' ? req.auth.id : null, customerName.trim(), req.auth?.email || customerEmail || null,
        deliveryType, address?.trim() || null, paymentMethod, cashAmount ? Number(cashAmount) : null, total],
    );
    const order = inserted.rows[0];
    for (const item of items as OrderItemInput[]) {
      await client.query(
        'INSERT INTO order_items (order_id, product_name, quantity, unit_price, notes) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.name.trim(), Number(item.quantity), Number(item.price), item.notes?.trim() || null],
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ ...order, total });
  } catch (error) {
    await client.query('ROLLBACK');
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
       RETURNING id, status`,
      [status, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró el pedido.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update order status:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el pedido.' });
  }
}