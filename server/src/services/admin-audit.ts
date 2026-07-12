// 어드민 위험작업 감사 로그(admin_action_audit_log, 059) 기록 유틸 — Phase 7(§19) 공용.
// 결제취소/인증초기화/세션강제종료 등 admin-* 라우터 전반에서 재사용한다.

import pool from '../db/mysql';

export interface AdminAuditEntry {
  administratorId: number;
  actionType: string;
  targetType: string;
  targetId: string | number;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  requestIp?: string | null;
}

export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO admin_action_audit_log
       (administrator_id, action_type, target_type, target_id, reason, metadata, request_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.administratorId,
      entry.actionType,
      entry.targetType,
      String(entry.targetId),
      entry.reason ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.requestIp ?? null,
    ],
  );
}
