import { promises as fs } from "fs";
import path from "path";
import type { Database } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const emptyDb = (): Database => ({
  products: [],
  contentPacks: [],
  schedule: [],
  metrics: [],
  briefs: [],
});

let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readDb(): Promise<Database> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    return {
      products: parsed.products ?? [],
      contentPacks: parsed.contentPacks ?? [],
      schedule: parsed.schedule ?? [],
      metrics: parsed.metrics ?? [],
      briefs: parsed.briefs ?? [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const db = emptyDb();
      await writeDb(db);
      return db;
    }
    throw err;
  }
}

export async function writeDb(db: Database): Promise<void> {
  await ensureDataDir();
  const payload = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmp = `${DB_PATH}.tmp`;
    await fs.writeFile(tmp, payload, "utf8");
    await fs.rename(tmp, DB_PATH);
  });
  await writeQueue;
}

export async function updateDb(
  mutator: (db: Database) => void | Promise<void>
): Promise<Database> {
  const db = await readDb();
  await mutator(db);
  await writeDb(db);
  return db;
}

export function newId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function todayISO(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
