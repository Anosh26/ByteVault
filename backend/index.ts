import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { transferFunds } from './src/controllers/transaction.controller.ts';
import { authRouter } from './src/routes/auth.ts';
import { requireEmployeeAuth, requireEmployeeRole } from './src/middleware/auth.ts';
import { requireIdempotencyKey } from './src/middleware/idempotency.ts';
import { transfersRouter } from './src/routes/transfers.ts';
import { devRouter } from './src/routes/dev.ts';
import { requestLogger } from './src/middleware/requestLogger.ts';
import { poolA, poolB } from './src/db.ts';
import { log } from './src/utils/logger.ts';
import { usersRouter } from './src/routes/users.ts';
import { accountsRouter } from './src/routes/accounts.ts';
import { ledgerRouter } from './src/routes/ledger.ts';
import { holdsRouter } from './src/routes/holds.ts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/health/deep', async (_req, res) => {
  const checks: Record<string, unknown> = {};
  try {
    // DB connectivity
    checks.dbMain = (await poolA().query('SELECT 1 AS ok')).rows[0]?.ok === 1;
  } catch (e) {
    checks.dbMain = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  try {
    checks.dbSub = (await poolB().query('SELECT 1 AS ok')).rows[0]?.ok === 1;
  } catch (e) {
    checks.dbSub = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  // 2PC enabled?
  try {
    const v = await poolA().query("SHOW max_prepared_transactions");
    checks.twoPc = { maxPrepared: Number(v.rows[0]?.max_prepared_transactions ?? 0) };
  } catch (e) {
    checks.twoPc = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  // FDW available? (Main imports Sub as fdw_sub)
  try {
    const ft = await poolA().query(
      "SELECT COUNT(*)::int AS n FROM information_schema.foreign_tables WHERE foreign_table_schema='fdw_sub'",
    );
    checks.fdw = { foreignTables: ft.rows[0]?.n ?? 0 };
  } catch (e) {
    checks.fdw = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  const ok =
    checks.dbMain === true &&
    checks.dbSub === true &&
    typeof checks.twoPc === 'object' &&
    (checks.twoPc as any).maxPrepared > 0;

  return res.status(ok ? 200 : 503).json({ ok, checks });
});

app.use('/api/auth', authRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/dev', devRouter);
app.use('/api/users', usersRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/holds', holdsRouter);

// Temporary: direct 2PC transfer is protected (will become checker-approved flow next).
app.post(
  '/api/transfers',
  requireEmployeeAuth,
  requireEmployeeRole('ADMIN'),
  requireIdempotencyKey({ routeTag: 'POST /api/transfers' }),
  transferFunds,
);

// Basic error handler (so thrown errors become JSON and get logged)
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log('error', 'request.error', {
    requestId: (req as any).requestId,
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
  });
  // HttpError support
  const anyErr = err as any;
  if (anyErr && typeof anyErr.status === 'number') {
    return res.status(anyErr.status).json({
      error: anyErr.message ?? 'Request failed',
      code: anyErr.code,
      details: anyErr.details,
    });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`ByteVault API listening on http://localhost:${port}`);
});
