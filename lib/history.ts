// Search past entries so they can be logged again. Repeats of the same item
// (same name and portion) collapse into one result, the latest version.

import type { FoodEntry } from "./store.ts";

export interface PastItem {
  entry: FoodEntry;
  /** How many times it was logged. */
  count: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Past items matching every word of `query` (in the name or portion), most
 * recently logged first. An empty query gives the most recent items.
 */
export function searchHistory(entries: FoodEntry[], query: string, kind: "food" | "exercise" = "food"): PastItem[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const byKey = new Map<string, PastItem>();
  for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    if ((e.kind ?? "food") !== kind) continue;
    const key = `${e.name.trim()}|${e.portion.trim()}`.toLowerCase();
    const seen = byKey.get(key);
    if (seen) {
      seen.count++;
      continue;
    }
    const text = norm(`${e.name} ${e.portion}`);
    if (words.every((w) => text.includes(w))) byKey.set(key, { entry: e, count: 1 });
  }
  return [...byKey.values()];
}
