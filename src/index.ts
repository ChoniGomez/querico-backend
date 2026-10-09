import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import categoryRoutes from './routes/categoryRoutes';
import productRoutes from './routes/productRoutes';
import { ensureCategorySchema } from './controllers/categoryController';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'API funcionando correctamente' });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/categories', categoryRoutes);
app.use('/api/products', productRoutes);

// Asegurar que la tabla categories tenga las columnas necesarias (display_order, sort_order, is_visible)
ensureCategorySchema().catch((err) => {
  console.warn('Inicialización de esquema de categorías:', err?.message || err);
});

app.listen(port, () => {
  console.log(`⚡️[server]: El servidor está corriendo en http://localhost:${port}`);
});
