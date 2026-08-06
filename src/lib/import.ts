import { newId } from "./db";
import { detectPlatformFromUrl } from "./platform-detect";
import type { Platform, Product } from "./types";

type RawRow = Record<string, unknown>;

function pick(row: RawRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return undefined;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePlatform(raw: unknown): Platform {
  const p = String(raw ?? "shopee").toLowerCase();
  if (p.includes("tiktok")) return "tiktok_shop";
  if (p.includes("face")) return "facebook";
  return "shopee";
}

/** Minimal CSV parser supporting quoted fields. */
export function parseCsv(text: string): RawRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function normalizeImportRow(row: RawRow): Omit<
  Product,
  "id" | "createdAt" | "updatedAt"
> | null {
  const name = String(
    pick(row, ["name", "ชื่อ", "product_name"]) ?? "",
  ).trim();
  const affiliateUrl = String(
    pick(row, ["affiliateUrl", "affiliate_url", "url", "ลิงก์"]) ?? "",
  ).trim();
  if (!name || !affiliateUrl) return null;

  const sellingPoints = asStringList(
    pick(row, ["sellingPoints", "selling_points", "จุดขาย"]),
  );
  const painPoints = asStringList(
    pick(row, ["painPoints", "pain_points", "pain", "ปัญหา"]),
  );

  const platformRaw = pick(row, ["platform", "แพลตฟอร์ม"]);
  const platform =
    platformRaw !== undefined && String(platformRaw).trim() !== ""
      ? normalizePlatform(platformRaw)
      : detectPlatformFromUrl(affiliateUrl) ?? "shopee";

  return {
    name,
    platform,
    affiliateUrl,
    price: Number(pick(row, ["price", "ราคา"]) ?? 0) || 0,
    commissionRate:
      Number(pick(row, ["commissionRate", "commission_rate", "คอม"]) ?? 0) || 0,
    category: String(pick(row, ["category", "หมวด"]) ?? "ทั่วไป").trim() || "ทั่วไป",
    sellingPoints: sellingPoints.length ? sellingPoints : ["ใช้งานง่าย"],
    painPoints: painPoints.length
      ? painPoints
      : ["ปัญหาจุกจิกในชีวิตประจำวัน"],
    targetAudience: String(
      pick(row, ["targetAudience", "target_audience", "กลุ่มเป้าหมาย"]) ??
        "ผู้ใช้ทั่วไป",
    ).trim(),
    videoEase: Math.max(
      1,
      Math.min(5, Number(pick(row, ["videoEase", "video_ease"]) ?? 3) || 3),
    ),
    seasonalScore: Math.max(
      1,
      Math.min(
        5,
        Number(pick(row, ["seasonalScore", "seasonal_score"]) ?? 3) || 3,
      ),
    ),
    notes: String(pick(row, ["notes", "โน้ต"]) ?? "imported").trim(),
    active: true,
  };
}

function urlKey(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

export function rowsToProducts(
  rows: RawRow[],
  existingUrls: string[] = [],
): {
  products: Product[];
  skipped: number;
  duplicates: number;
} {
  const now = new Date().toISOString();
  const products: Product[] = [];
  let skipped = 0;
  let duplicates = 0;
  const seen = new Set(existingUrls.map(urlKey));

  for (const row of rows) {
    const normalized = normalizeImportRow(row);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    const key = urlKey(normalized.affiliateUrl);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    products.push({
      ...normalized,
      id: newId("prod"),
      createdAt: now,
      updatedAt: now,
    });
  }
  return { products, skipped, duplicates };
}

export function parseImportPayload(
  body: string,
  contentType: string | null,
): RawRow[] {
  const ct = (contentType || "").toLowerCase();
  const trimmed = body.trim();
  if (ct.includes("json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed as RawRow[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)) {
      return (parsed as { products: RawRow[] }).products;
    }
    if (parsed && typeof parsed === "object") return [parsed as RawRow];
    return [];
  }
  return parseCsv(trimmed);
}
