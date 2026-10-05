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
exports.createOrder = createOrder;
exports.getMyOrders = getMyOrders;
exports.getAllOrders = getAllOrders;
exports.updateOrderStatus = updateOrderStatus;
const database_1 = require("../config/database");
function loadOrders(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const whereClause = userId ? 'WHERE o.user_id = $1' : '';
        const values = userId ? [userId] : [];
        return database_1.pool.query(`SELECT o.id, o.customer_name AS "customerName", o.customer_email AS "customerEmail",
            o.delivery_type AS "deliveryType", o.address, o.payment_method AS "paymentMethod",
            o.cash_amount AS "cashAmount", o.total, o.status, o.created_at AS "createdAt",
            COALESCE(json_agg(json_build_object(
              'name', oi.product_name, 'quantity', oi.quantity, 'price', oi.unit_price, 'notes', oi.notes
            ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    ${whereClause}
     GROUP BY o.id ORDER BY o.created_at DESC`, values);
    });
}
function createOrder(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { customerName, deliveryType, address, paymentMethod, cashAmount, items } = req.body || {};
        if (!(customerName === null || customerName === void 0 ? void 0 : customerName.trim()) || !['delivery', 'pickup'].includes(deliveryType)
            || !['cash', 'transfer'].includes(paymentMethod) || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Revisá los datos del pedido.' });
        }
        if (deliveryType === 'delivery' && !(address === null || address === void 0 ? void 0 : address.trim())) {
            return res.status(400).json({ message: 'La dirección es obligatoria para el delivery.' });
        }
        const validItems = items.every((item) => {
            var _a;
            return ((_a = item.name) === null || _a === void 0 ? void 0 : _a.trim())
                && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0
                && Number.isFinite(Number(item.price)) && Number(item.price) >= 0;
        });
        if (!validItems)
            return res.status(400).json({ message: 'Hay productos inválidos en el pedido.' });
        const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
        const client = yield database_1.pool.connect();
        try {
            yield client.query('BEGIN');
            const inserted = yield client.query(`INSERT INTO orders (user_id, customer_name, customer_email, delivery_type, address,
                           payment_method, cash_amount, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at AS "createdAt"`, [((_a = req.auth) === null || _a === void 0 ? void 0 : _a.role) === 'cliente' ? req.auth.id : null, customerName.trim(), ((_b = req.auth) === null || _b === void 0 ? void 0 : _b.email) || null,
                deliveryType, (address === null || address === void 0 ? void 0 : address.trim()) || null, paymentMethod, cashAmount ? Number(cashAmount) : null, total]);
            const order = inserted.rows[0];
            for (const item of items) {
                yield client.query('INSERT INTO order_items (order_id, product_name, quantity, unit_price, notes) VALUES ($1, $2, $3, $4, $5)', [order.id, item.name.trim(), Number(item.quantity), Number(item.price), ((_c = item.notes) === null || _c === void 0 ? void 0 : _c.trim()) || null]);
            }
            yield client.query('COMMIT');
            return res.status(201).json(Object.assign(Object.assign({}, order), { total }));
        }
        catch (error) {
            yield client.query('ROLLBACK');
            console.error('Order creation failed:', error);
            return res.status(500).json({ message: 'No se pudo guardar el pedido.' });
        }
        finally {
            client.release();
        }
    });
}
function getMyOrders(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield loadOrders(req.auth.id);
            return res.json(result.rows);
        }
        catch (error) {
            console.error('Could not load customer orders:', error);
            return res.status(500).json({ message: 'No se pudo cargar el historial de pedidos.' });
        }
    });
}
function getAllOrders(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield loadOrders();
            return res.json(result.rows);
        }
        catch (error) {
            console.error('Could not load orders:', error);
            return res.status(500).json({ message: 'No se pudieron cargar los pedidos.' });
        }
    });
}
function updateOrderStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { status } = req.body || {};
        if (status !== 'Entregado')
            return res.status(400).json({ message: 'El estado solicitado no es válido.' });
        try {
            const result = yield database_1.pool.query(`UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, status`, [status, req.params.id]);
            if (result.rowCount === 0)
                return res.status(404).json({ message: 'No se encontró el pedido.' });
            return res.json(result.rows[0]);
        }
        catch (error) {
            console.error('Could not update order status:', error);
            return res.status(500).json({ message: 'No se pudo actualizar el pedido.' });
        }
    });
}
