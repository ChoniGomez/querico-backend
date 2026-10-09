import { Request, Response } from 'express';
import { pool } from '../config/database';

let schemaEnsured = false;

export async function ensureCategorySchema(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        display_order INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        is_visible BOOLEAN NOT NULL DEFAULT true
      );
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
      ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;
      UPDATE categories SET display_order = sort_order WHERE (display_order IS NULL OR display_order = 0) AND sort_order IS NOT NULL;
      UPDATE categories SET sort_order = display_order WHERE (sort_order IS NULL OR sort_order = 0) AND display_order IS NOT NULL;
    `);
    schemaEnsured = true;
  } catch (error) {
    console.warn('Advertencia al verificar esquema de categories:', (error as Error).message);
  }
}

export async function getCategories(req: Request, res: Response) {
  await ensureCategorySchema();
  const includeHidden = req.query.all === 'true';
  try {
    const result = await pool.query(
      `SELECT id, name,
              COALESCE(display_order, sort_order, 0) AS "displayOrder",
              COALESCE(display_order, sort_order, 0) AS "sortOrder",
              is_visible AS "isVisible"
       FROM categories
       ${includeHidden ? '' : 'WHERE is_visible = TRUE'}
       ORDER BY COALESCE(display_order, sort_order, 0) ASC, id ASC`,
    );
    return res.json(result.rows);
  } catch (error) {
    console.error('Could not load categories:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las categorías.' });
  }
}

export async function createCategory(req: Request, res: Response) {
  await ensureCategorySchema();
  const { name, displayOrder, sortOrder, display_order, sort_order, isVisible, is_visible } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio.' });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    return res.status(400).json({ message: 'El nombre de la categoría no puede superar los 100 caracteres.' });
  }

  const incomingOrder = displayOrder !== undefined ? displayOrder :
                        display_order !== undefined ? display_order :
                        sortOrder !== undefined ? sortOrder :
                        sort_order;

  let orderNumber: number;
  if (incomingOrder !== undefined && incomingOrder !== null && incomingOrder !== '') {
    const parsed = Number(incomingOrder);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return res.status(400).json({ message: 'El orden debe ser un número entero mayor o igual a 0.' });
    }
    orderNumber = parsed;
  } else {
    try {
      const maxOrderResult = await pool.query(
        `SELECT COALESCE(MAX(COALESCE(display_order, sort_order, 0)), 0) + 1 AS next_order FROM categories`
      );
      orderNumber = Number(maxOrderResult.rows[0]?.next_order || 1);
    } catch {
      orderNumber = 1;
    }
  }

  const incomingVisible = isVisible !== undefined ? isVisible :
                          is_visible !== undefined ? is_visible :
                          true;
  const visible = Boolean(incomingVisible);

  try {
    const result = await pool.query(
      `INSERT INTO categories (name, display_order, sort_order, is_visible)
       VALUES ($1, $2, $2, $3)
       RETURNING id, name,
                 COALESCE(display_order, sort_order, 0) AS "displayOrder",
                 COALESCE(display_order, sort_order, 0) AS "sortOrder",
                 is_visible AS "isVisible"`,
      [trimmedName, orderNumber, visible],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Could not create category:', error);
    return res.status(500).json({ message: 'No se pudo crear la categoría.' });
  }
}

export async function updateCategory(req: Request, res: Response) {
  await ensureCategorySchema();
  const categoryId = parseInt(req.params.id, 10);
  if (Number.isNaN(categoryId)) {
    return res.status(400).json({ message: 'ID de categoría no válido.' });
  }

  const { name, displayOrder, sortOrder, display_order, sort_order, isVisible, is_visible, visible } = req.body || {};

  try {
    const existing = await pool.query(
      `SELECT id, name,
              COALESCE(display_order, sort_order, 0) AS "displayOrder",
              is_visible AS "isVisible"
       FROM categories WHERE id = $1`,
      [categoryId],
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ message: 'No se encontró la categoría.' });
    }

    const current = existing.rows[0];

    let updatedName = current.name;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'El nombre no puede estar vacío.' });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ message: 'El nombre no puede superar los 100 caracteres.' });
      }
      updatedName = name.trim();
    }

    let updatedOrder = current.displayOrder;
    const incomingOrder = displayOrder !== undefined ? displayOrder :
                          display_order !== undefined ? display_order :
                          sortOrder !== undefined ? sortOrder :
                          sort_order;
    if (incomingOrder !== undefined && incomingOrder !== null && incomingOrder !== '') {
      const parsed = Number(incomingOrder);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'El orden debe ser un número entero mayor o igual a 0.' });
      }
      updatedOrder = parsed;
    }

    let updatedVisible = current.isVisible;
    const incomingVisible = isVisible !== undefined ? isVisible :
                            is_visible !== undefined ? is_visible :
                            visible;
    if (incomingVisible !== undefined) {
      if (typeof incomingVisible !== 'boolean') {
        return res.status(400).json({ message: 'El campo de visibilidad debe ser verdadero o falso.' });
      }
      updatedVisible = incomingVisible;
    }

    const result = await pool.query(
      `UPDATE categories
       SET name = $1, display_order = $2, sort_order = $2, is_visible = $3
       WHERE id = $4
       RETURNING id, name,
                 COALESCE(display_order, sort_order, 0) AS "displayOrder",
                 COALESCE(display_order, sort_order, 0) AS "sortOrder",
                 is_visible AS "isVisible"`,
      [updatedName, updatedOrder, updatedVisible, categoryId],
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update category:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la categoría.' });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  await ensureCategorySchema();
  const categoryId = parseInt(req.params.id, 10);
  if (Number.isNaN(categoryId)) {
    return res.status(400).json({ message: 'ID de categoría no válido.' });
  }

  try {
    const existing = await pool.query('SELECT id, name FROM categories WHERE id = $1', [categoryId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ message: 'No se encontró la categoría.' });
    }

    // Comprobar si hay productos asociados a esta categoría
    const productsCheck = await pool.query(
      'SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1',
      [categoryId],
    );
    const count = productsCheck.rows[0]?.count || 0;
    if (count > 0) {
      return res.status(400).json({
        message: `No se puede eliminar la categoría "${existing.rows[0].name}" porque tiene ${count} producto(s) asociado(s). Reasigna o elimina los productos primero.`,
      });
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    return res.json({ message: 'Categoría eliminada con éxito.', id: categoryId });
  } catch (error) {
    console.error('Could not delete category:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la categoría.' });
  }
}

export async function updateCategoryVisibility(req: Request, res: Response) {
  await ensureCategorySchema();
  const { visible } = req.body || {};
  if (typeof visible !== 'boolean') {
    return res.status(400).json({ message: 'El campo visible debe ser verdadero o falso.' });
  }
  try {
    const result = await pool.query(
      `UPDATE categories
       SET is_visible = $1
       WHERE id = $2
       RETURNING id, name,
                 COALESCE(display_order, sort_order, 0) AS "displayOrder",
                 COALESCE(display_order, sort_order, 0) AS "sortOrder",
                 is_visible AS "isVisible"`,
      [visible, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'No se encontró la categoría.' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Could not update category visibility:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la visibilidad.' });
  }
}