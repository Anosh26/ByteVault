import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { transferFunds } from './src/controllers/transaction.controller.ts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/transfers', transferFunds);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`ByteVault API listening on http://localhost:${port}`);
});
