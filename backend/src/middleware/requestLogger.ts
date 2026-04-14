import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { log } from '../utils/logger.ts';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function getRequestId(req: Request): string {
  const incoming = req.header('x-request-id');
  if (incoming && incoming.length <= 80) return incoming;
  return crypto.randomUUID();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = getRequestId(req);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = performance.now();
  const path = req.originalUrl || req.url;

  log('info', 'request.start', {
    requestId,
    method: req.method,
    path,
    ip: req.ip,
  });

  res.on('finish', () => {
    const ms = Math.round(performance.now() - start);
    const emp = req.employee;
    log('info', 'request.end', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      ms,
      employee: emp ? { id: emp.id, role: emp.role } : null,
    });
  });

  next();
}

