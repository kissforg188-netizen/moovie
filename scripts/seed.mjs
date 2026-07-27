import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");

/** Reset DB to empty — no sample products. */
const db = {
  products: [],
  contentPacks: [],
  schedule: [],
  briefs: [],
  automationLogs: [],
  accounts: [],
};

await mkdir(dataDir, { recursive: true });
await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log(`Cleared database (0 products) → ${dbPath}`);
console.log("เพิ่มสินค้าจริงที่ /products หรือ /automation");
