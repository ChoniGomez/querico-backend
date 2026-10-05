"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategories = getCategories;
exports.updateCategoryVisibility = updateCategoryVisibility;
const database_1 = require("../config/database");
function getCategories(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const includeHidden = req.query.all === 'true';
        try {
            const result = yield database_1.pool.query(`SELECT id, name, sort_order AS "sortOrder", is_visible AS "isVisible"
       FROM categories ${includeHidden ? '' : 'WHERE is_visible = TRUE'}
       ORDER BY sort_order, id`);
            return res.json(result.rows);
        }
        catch (error) {
            console.error('Could not load categories:', error);
            return res.status(500).json({ message: 'No se pudieron cargar las categorías.' });
        }
    });
}
function updateCategoryVisibility(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { visible } = req.body || {};
        if (typeof visible !== 'boolean') {
            return res.status(400).json({ message: 'El campo visible debe ser verdadero o falso.' });
        }
        try {
            const result = yield database_1.pool.query(`UPDATE categories SET is_visible = $1 WHERE id = $2
       RETURNING id, name, sort_order AS "sortOrder", is_visible AS "isVisible"`, [visible, req.params.id]);
            if (result.rowCount === 0)
                return res.status(404).json({ message: 'No se encontró la categoría.' });
            return res.json(result.rows[0]);
        }
        catch (error) {
            console.error('Could not update category visibility:', error);
            return res.status(500).json({ message: 'No se pudo actualizar la visibilidad.' });
        }
    });
}
