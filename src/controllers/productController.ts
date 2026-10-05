import { Request, Response } from 'express';
import { pool } from '../config/database';

export async function getProducts(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.category_id AS category, p.name, p.description,
              p.price::float8 AS price, p.image_url AS image,
              CASE WHEN p.is_new THEN 'NUEVO' ELSE NULL END AS badge,
              p.is_available AS visible
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.is_available = TRUE AND c.is_visible = TRUE
       ORDER BY c.sort_order, p.id`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load products:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los productos.' });
  }
}