import type { AutomationSettings, Database } from "./types";

export const DEFAULT_SETTINGS: AutomationSettings = {
  maxPostsPerDay: 3,
  cooldownDays: 3,
  staleDraftDays: 5,
};

export function normalizeMaxPosts(value: unknown): 2 | 3 {
  const n = Number(value);
  return n === 2 ? 2 : 3;
}

export function normalizeCooldownDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.cooldownDays;
  return Math.min(7, Math.max(2, n));
}

export function normalizeStaleDraftDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.staleDraftDays;
  return Math.min(14, Math.max(3, n));
}

export function resolveSettings(db: Database): AutomationSettings {
  const max = db.settings?.maxPostsPerDay;
  return {
    maxPostsPerDay: max === 2 || max === 3 ? max : DEFAULT_SETTINGS.maxPostsPerDay,
    cooldownDays: normalizeCooldownDays(
      db.settings?.cooldownDays ?? DEFAULT_SETTINGS.cooldownDays,
    ),
    staleDraftDays: normalizeStaleDraftDays(
      db.settings?.staleDraftDays ?? DEFAULT_SETTINGS.staleDraftDays,
    ),
    updatedAt: db.settings?.updatedAt,
  };
}
