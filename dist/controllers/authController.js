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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signInWithGoogle = signInWithGoogle;
const google_auth_library_1 = require("google-auth-library");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const googleClient = new google_auth_library_1.OAuth2Client();
function createSession(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('JWT_SECRET no está configurado.');
    const token = jsonwebtoken_1.default.sign({ role: user.role, email: user.email, name: user.name }, secret, { subject: String(user.id), expiresIn: '7d' });
    return { token, user: Object.assign(Object.assign({}, user), { id: String(user.id) }) };
}
function signInWithGoogle(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const credential = (_a = req.body) === null || _a === void 0 ? void 0 : _a.credential;
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!credential || !clientId) {
            return res.status(400).json({ message: 'Falta configurar el inicio de sesión con Google.' });
        }
        let profile;
        try {
            const ticket = yield googleClient.verifyIdToken({ idToken: credential, audience: clientId });
            profile = ticket.getPayload();
        }
        catch (_b) {
            return res.status(401).json({ message: 'No se pudo validar la cuenta de Google.' });
        }
        if (!(profile === null || profile === void 0 ? void 0 : profile.sub) || !profile.email || !profile.email_verified || !profile.name) {
            return res.status(401).json({ message: 'La cuenta de Google no pudo ser verificada.' });
        }
        try {
            const result = yield database_1.pool.query(`INSERT INTO users (google_id, email, name, photo_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, photo_url = EXCLUDED.photo_url, updated_at = NOW()
        RETURNING id, email, name, photo_url AS "photoURL", role`, [profile.sub, profile.email, profile.name, profile.picture || null]);
            return res.json(createSession(result.rows[0]));
        }
        catch (error) {
            console.error('Could not persist Google user:', error);
            return res.status(500).json({ message: 'No se pudo guardar la sesión del usuario.' });
        }
    });
}
