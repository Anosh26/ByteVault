import { poolA } from '../db.ts';
import { log } from '../utils/logger.ts';

export class AuditService {
  static async log(params: {
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    meta?: unknown;
  }) {
    const { actorId, action, entityType, entityId, meta } = params;
    
    try {
      await poolA().query(
        `INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, meta)
         VALUES ('EMPLOYEE', $1, $2, $3, $4, $5)`,
        [actorId, action, entityType, entityId ?? null, meta ?? null]
      );
    } catch (err) {
      log('error', 'audit_service.failure', {
        action,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
