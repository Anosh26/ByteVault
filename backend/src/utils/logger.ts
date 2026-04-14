type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function nowIso() {
  return new Date().toISOString();
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '"[unserializable]"';
  }
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: nowIso(),
    level,
    msg: message,
    ...(meta ? { meta } : {}),
  };
  const line = safeJson(entry);
  // Keep it simple: structured logs to stdout/stderr
  if (level === 'error') console.error(line);
  else console.log(line);
}

