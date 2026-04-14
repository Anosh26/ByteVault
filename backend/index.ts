import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { transferFunds } from './src/controllers/transaction.controller.ts';
import { authRouter } from './src/routes/auth.ts';
import { requireEmployeeAuth } from './src/middleware/auth.ts';
import { requireIdempotencyKey } from './src/middleware/idempotency.ts';
import { transfersRouter } from './src/routes/transfers.ts';
import { devRouter } from './src/routes/dev.ts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/dev', devRouter);

// Temporary: direct 2PC transfer is protected (will become checker-approved flow next).
app.post(
  '/api/transfers',
  requireEmployeeAuth,
  requireIdempotencyKey({ routeTag: 'POST /api/transfers' }),
  transferFunds,
);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`ByteVault API listening on http://localhost:${port}`);
});
