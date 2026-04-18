/** Backend requires a unique Idempotency-Key per mutating request (per employee + route). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
