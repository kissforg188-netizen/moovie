import type { AutomationSettings, Database } from "./types";

export const DEFAULT_SETTINGS: AutomationSettings = {
  maxPostsPerDay: 3,
};

export function resolveSettings(db: Database): AutomationSettings {
  const max = db.settings?.maxPostsPerDay;
  return {
    maxPostsPerDay: max === 2 || max === 3 ? max : DEFAULT_SETTINGS.maxPostsPerDay,
    updatedAt: db.settings?.updatedAt,
  };
}

export function normalizeMaxPosts(value: unknown): 2 | 3 {
  const n = Number(value);
  return n === 2 ? 2 : 3;
}
