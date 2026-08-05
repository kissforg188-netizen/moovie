import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_ACCOUNTS } from "./accounts";
import { DEFAULT_SETTINGS } from "./settings";
import type { Database } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const BANGKOK_TZ = "Asia/Bangkok";

const emptyDb = (): Database => ({
  products: [],
  contentPacks: [],
  schedule: [],
  briefs: [],
  automationLogs: [],
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  settings: { ...DEFAULT_SETTINGS },
  learning: undefined,
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
      automationLogs: parsed.automationLogs ?? [],
      accounts: parsed.accounts ?? DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      // Critical: evening learning must survive reloads for next-morning bias
      learning: parsed.learning,
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

/** Calendar parts in Asia/Bangkok (affiliate ops timezone). */
export function bangkokParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  ymd: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const year = num("year");
  const month = num("month");
  const day = num("day");
  return {
    year,
    month,
    day,
    ymd: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Today as YYYY-MM-DD in Asia/Bangkok (not UTC). */
export function todayISO(date = new Date()): string {
  return bangkokParts(date).ymd;
}

/** Stable Date for a YYYY-MM-DD calendar day (noon Bangkok). */
export function dateFromYmd(ymd: string): Date {
  // 12:00 Asia/Bangkok = 05:00 UTC
  return new Date(`${ymd}T05:00:00.000Z`);
}
