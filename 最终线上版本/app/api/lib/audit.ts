import { auditLogs } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";

/** 审计日志：后台写操作与对外消息发送统一落表 */
export async function logAudit(actor: string, action: string, target?: string, detail?: unknown) {
  await ensureTable();
  await getDb().insert(auditLogs).values({
    actor,
    action,
    target: target ?? null,
    detail: detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail),
  });
}
