import { Request, Response } from 'express';
import { pool } from '../config/database';

export async function getCategories(req: Request, res: Response) {
  const includeHidden = req.query.all === 'true';
  try {
    const result = await pool.query(
      `SELECT id, name, sort_order AS "sortOrder", is_visible AS "isVisible"
       FROM categories ${includeHidden ? '' : 'WHERE is_visible = TRUE'}
       ORDER BY sort_order, id`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load categories:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las categorías.' });
  }
}

export async function updateCategoryVisibility(req: Request, res: Response) {
  const { visible } = req.body || {};
  if (typeof visible !== 'boolean') {
    return res.status(400).json({ message: 'El campo visible debe ser verdadero o falso.' });
  }
  try {
    const result = await pool.query(
      `UPDATE categories SET is_visible = $1 WHERE id = $2
       RETURNING id, name, sort_order AS "sortOrder", is_visible AS "isVisible"`,
      [visible, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró la categoría.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update category visibility:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la visibilidad.' });
  }
}