"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuthenticate = optionalAuthenticate;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function readToken(req, res, next, optional) {
    const authorization = req.headers.authorization;
    if (!(authorization === null || authorization === void 0 ? void 0 : authorization.startsWith('Bearer '))) {
        if (optional)
            return next();
        return res.status(401).json({ message: 'Iniciá sesión para continuar.' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret)
        return res.status(500).json({ message: 'JWT_SECRET no está configurado.' });
    try {
        const payload = jsonwebtoken_1.default.verify(authorization.slice(7), secret);
        if (typeof payload === 'string' || !payload.sub || !payload.role || !payload.email || !payload.name) {
            return res.status(401).json({ message: 'La sesión no es válida.' });
        }
        if (payload.role !== 'cliente' && payload.role !== 'administrador') {
            return res.status(401).json({ message: 'La sesión no es válida.' });
        }
        req.auth = {
            id: payload.sub,
            role: payload.role,
            email: payload.email,
            name: payload.name,
        };
        return next();
    }
    catch (_a) {
        return res.status(401).json({ message: 'La sesión expiró. Iniciá sesión nuevamente.' });
    }
}
function authenticate(req, res, next) {
    return readToken(req, res, next, false);
}
function optionalAuthenticate(req, res, next) {
    return readToken(req, res, next, true);
}
function requireRole(role) {
    return (req, res, next) => {
        var _a;
        if (((_a = req.auth) === null || _a === void 0 ? void 0 : _a.role) !== role)
            return res.status(403).json({ message: 'No tenés permisos para esta acción.' });
        return next();
    };
}
