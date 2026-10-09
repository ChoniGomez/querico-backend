import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';

const availabilitySql = `CASE
  WHEN NOT p.is_available THEN 'unavailable'
  WHEN p.start_date_time IS NOT NULL AND p.start_date_time > NOW() THEN 'scheduled'
  WHEN p.end_date_time IS NOT NULL AND p.end_date_time <= NOW() THEN 'expired'
  WHEN p.stock IS NOT NULL AND p.stock <= 0 THEN 'sold_out'
  ELSE 'available'
END`;

export async function getPromotions(req: AuthenticatedRequest, res: Response) {
  // Para el panel de administración (o ?all=true), retornamos TODAS las promociones
  // sin ningún filtro restrictivo de fecha o disponibilidad.
  const isForAdmin = req.query.all === 'true' || req.auth?.role === 'admin';

  try {
    const query = `
      SELECT p.id,
             p.id AS "productId",
             p.name AS "productName",
             COALESCE(p.name, 'Promoción') AS name,
             CONCAT(p.promo_min_quantity, '+ unidades con ', p.promo_discount_percent, '% OFF') AS details,
             'discount' AS type,
             p.promo_discount_percent::float8 AS value,
             p.promo_discount_percent::float8 AS "discountPercent",
             p.promo_min_quantity AS "minQuantity",
             p.start_date_time AS "startDateTime",
             p.end_date_time AS "endDateTime",
             p.stock,
             p.image_url AS image,
             p.is_available AS visible,
             p.price::float8 AS price,
             ${availabilitySql} AS "availabilityStatus"
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.promo_min_quantity IS NOT NULL 
        AND p.promo_discount_percent IS NOT NULL
        ${isForAdmin ? '' : `AND (c.is_visible IS NULL OR c.is_visible = TRUE) AND p.is_available = TRUE AND (${availabilitySql} = 'available')`}
      ORDER BY p.id ASC
    `;

    const result = await pool.query(query);
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load promotions:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las promociones.' });
  }
}

export async function createOrUpdatePromotion(req: Request, res: Response) {
  const { productId, minQuantity, discountPercent, startDateTime, endDateTime, stock } = req.body || {};

  const id = parseInt(productId, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'ID de producto no válido.' });
  }

  const normalizedMinimum = minQuantity === '' || minQuantity === undefined || minQuantity === null
    ? null : Number(minQuantity);
  const normalizedDiscount = discountPercent === '' || discountPercent === undefined || discountPercent === null
    ? null : Number(discountPercent);

  if (normalizedMinimum !== null && (!Number.isInteger(normalizedMinimum) || normalizedMinimum < 1)) {
    return res.status(400).json({ message: 'La cantidad mínima debe ser un entero mayor a 0.' });
  }
  if (normalizedDiscount !== null && (!Number.isFinite(normalizedDiscount) || normalizedDiscount <= 0 || normalizedDiscount >= 100)) {
    return res.status(400).json({ message: 'El descuento debe ser un porcentaje entre 0 y 100.' });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET promo_min_quantity = $1,
           promo_discount_percent = $2,
           start_date_time = COALESCE($3, start_date_time),
           end_date_time = COALESCE($4, end_date_time),
           stock = COALESCE($5, stock)
       WHERE id = $6
       RETURNING id, name, promo_min_quantity AS "promoMinQuantity", promo_discount_percent::float8 AS "promoDiscountPercent"`,
      [normalizedMinimum, normalizedDiscount, startDateTime || null, endDateTime || null, stock ?? null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No se encontró el producto.' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not save promotion:', error);
    return res.status(500).json({ message: 'No se pudo guardar la promoción.' });
  }
}

export async function deletePromotion(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'ID de promoción o producto no válido.' });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET promo_min_quantity = NULL,
           promo_discount_percent = NULL
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No se encontró el producto.' });
    }

    return res.json({ message: 'Promoción eliminada con éxito.', productId: id });
  } catch (error) {
    console.error('Could not delete promotion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la promoción.' });
  }
}
