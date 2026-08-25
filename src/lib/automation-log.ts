import { newId, updateDb } from "./db";
import type { AutomationLog, Database } from "./types";

export async function logAutomationStart(
  jobType: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<string> {
  const id = newId("job");
  await updateDb((db) => {
    ensureLogs(db);
    db.automationLogs!.unshift({
      id,
      jobType,
      status: "running",
      message,
      meta,
      createdAt: new Date().toISOString(),
    });
    db.automationLogs = db.automationLogs!.slice(0, 100);
    return db;
  });
  return id;
}

export async function logAutomationFinish(
  id: string,
  status: AutomationLog["status"],
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await updateDb((db) => {
    ensureLogs(db);
    const row = db.automationLogs!.find((l) => l.id === id);
    if (row) {
      row.status = status;
      row.message = message;
      row.meta = meta;
      row.finishedAt = new Date().toISOString();
    }
    return db;
  });
}

function ensureLogs(db: Database): void {
  if (!db.automationLogs) db.automationLogs = [];
}
