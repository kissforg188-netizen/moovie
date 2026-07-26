import { promises as fs } from "fs";
import path from "path";
import type { Database } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const emptyDb = (): Database => ({
  products: [],
  contentPacks: [],
  schedule: [],
  briefs: [],
});

let writeQueue: Promise<void> = Promise.resolve();

async function ensureDb(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(emptyDb(), null, 2), "utf8");
  }
}

export async function readDb(): Promise<Database> {
  await ensureDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as Database;
    return {
      products: parsed.products ?? [],
      contentPacks: parsed.contentPacks ?? [],
      schedule: parsed.schedule ?? [],
      briefs: parsed.briefs ?? [],
    };
  } catch {
    return emptyDb();
  }
}

export async function writeDb(db: Database): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await ensureDb();
    const tmp = `${DB_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, DB_PATH);
  });
  return writeQueue;
}

export async function updateDb(
  updater: (db: Database) => Database | Promise<Database>,
): Promise<Database> {
  const current = await readDb();
  const next = await updater(current);
  await writeDb(next);
  return next;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISO(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
