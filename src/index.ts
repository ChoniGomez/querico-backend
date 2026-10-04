import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'API funcionando correctamente' });
});

// Rutas de ejemplo
// app.use('/api/products', productRoutes);

app.listen(port, () => {
  console.log(`⚡️[server]: El servidor está corriendo en http://localhost:${port}`);
});
