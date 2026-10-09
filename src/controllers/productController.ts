import { Request, Response } from 'express';
import { pool } from '../config/database';

const availabilitySql = `CASE
  WHEN NOT p.is_available THEN 'unavailable'
  WHEN p.start_date_time IS NOT NULL AND p.start_date_time > NOW() THEN 'scheduled'
  WHEN p.end_date_time IS NOT NULL AND p.end_date_time <= NOW() THEN 'expired'
  WHEN p.stock IS NOT NULL AND p.stock <= 0 THEN 'sold_out'
  ELSE 'available'
END`;

export async function getProducts(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.category_id AS category, p.name, p.description,
              p.price::float8 AS price, p.image_url AS image,
              CASE WHEN p.is_new THEN 'NUEVO' ELSE NULL END AS badge,
              p.is_available AS visible, p.start_date_time AS "startDateTime",
              p.end_date_time AS "endDateTime", p.stock,
              p.promo_min_quantity AS "promoMinQuantity",
              p.promo_discount_percent::float8 AS "promoDiscountPercent",
              ${availabilitySql} AS "availabilityStatus",
              ((${availabilitySql}) = 'available') AS "isPurchasable"
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
      WHERE c.is_visible = TRUE AND p.is_available = TRUE
       ORDER BY c.sort_order, p.id`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load products:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los productos.' });
  }
}

export async function getManageableProducts(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.category_id AS category, c.name AS "categoryName", p.name, p.description,
              p.price::float8 AS price, p.image_url AS image, p.is_available AS visible,
              p.start_date_time AS "startDateTime", p.end_date_time AS "endDateTime", p.stock,
              p.promo_min_quantity AS "promoMinQuantity",
              p.promo_discount_percent::float8 AS "promoDiscountPercent",
              ${availabilitySql} AS "availabilityStatus"
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order, p.id`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load manageable products:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los productos.' });
  }
}

export async function updateProductAvailability(req: Request, res: Response) {
  const { startDateTime, endDateTime, stock, promoMinQuantity, promoDiscountPercent } = req.body || {};
  const validDate = (value: unknown) => value === null || value === ''
    || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  const normalizedStart = startDateTime || null;
  const normalizedEnd = endDateTime || null;
  const normalizedStock = stock === '' || stock === undefined ? null : stock;
  const normalizedMinimum = promoMinQuantity === '' || promoMinQuantity === undefined || promoMinQuantity === null
    ? null : promoMinQuantity;
  const normalizedDiscount = promoDiscountPercent === '' || promoDiscountPercent === undefined || promoDiscountPercent === null
    ? null : promoDiscountPercent;

  if (!validDate(normalizedStart) || !validDate(normalizedEnd)
    || (normalizedStock !== null && (!Number.isInteger(normalizedStock) || normalizedStock < 0))
    || (normalizedMinimum !== null && (!Number.isInteger(normalizedMinimum) || normalizedMinimum < 1))
    || (normalizedDiscount !== null && (!Number.isFinite(normalizedDiscount) || normalizedDiscount <= 0 || normalizedDiscount >= 100))) {
    return res.status(400).json({ message: 'Revisá las fechas, el stock y la regla de descuento por cantidad.' });
  }
  if ((normalizedMinimum === null) !== (normalizedDiscount === null)) {
    return res.status(400).json({ message: 'Configurá juntos el mínimo de unidades y el porcentaje de descuento.' });
  }
  if (normalizedStart && normalizedEnd && Date.parse(normalizedEnd) <= Date.parse(normalizedStart)) {
    return res.status(400).json({ message: 'La fecha de cierre debe ser posterior a la fecha de apertura.' });
  }

  try {
    const result = await pool.query(
      `UPDATE products SET start_date_time = $1, end_date_time = $2, stock = $3,
              promo_min_quantity = $4, promo_discount_percent = $5
      WHERE id = $6
       RETURNING id, start_date_time AS "startDateTime", end_date_time AS "endDateTime", stock,
             promo_min_quantity AS "promoMinQuantity", promo_discount_percent::float8 AS "promoDiscountPercent"`,
      [normalizedStart, normalizedEnd, normalizedStock, normalizedMinimum, normalizedDiscount, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró el producto.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update product availability:', error);
    return res.status(500).json({ message: 'No se pudo guardar la disponibilidad.' });
  }
}

export async function updateProductVisibility(req: Request, res: Response) {
  const { visible } = req.body || {};
  if (typeof visible !== 'boolean') {
    return res.status(400).json({ message: 'El campo visible debe ser verdadero o falso.' });
  }
  try {
    const result = await pool.query(
      `UPDATE products SET is_available = $1 WHERE id = $2
       RETURNING id, is_available AS visible`,
      [visible, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró el producto.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update product visibility:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la visibilidad del producto.' });
  }
}