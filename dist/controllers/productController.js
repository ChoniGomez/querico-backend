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
exports.getProducts = getProducts;
const database_1 = require("../config/database");
function getProducts(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield database_1.pool.query(`SELECT p.id, p.category_id AS category, p.name, p.description,
              p.price::float8 AS price, p.image_url AS image,
              CASE WHEN p.is_new THEN 'NUEVO' ELSE NULL END AS badge,
              p.is_available AS visible
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       WHERE p.is_available = TRUE AND c.is_visible = TRUE
       ORDER BY c.sort_order, p.id`);
            return res.json(result.rows);
        }
        catch (error) {
            console.error('Could not load products:', error);
            return res.status(500).json({ message: 'No se pudieron cargar los productos.' });
        }
    });
}
