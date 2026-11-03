import { test } from "node:test";
import assert from "node:assert/strict";
import { searchHistory } from "./history.ts";
import type { FoodEntry } from "./store.ts";

const E = { calories: 100, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0, saturatedFatG: 0 };
const entry = (id: string, name: string, createdAt: number, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id, date: "2026-11-01", createdAt, meal: "lunch", name, portion: "1 bowl", nutrients: E, origin: "manual", ...extra,
});

const entries = [
  entry("1", "Grouper fish soup", 1),
  entry("2", "Chicken rice", 2),
  entry("3", "Grouper Fish Soup", 3),
  entry("4", "Fish ball noodles", 4),
  entry("5", "Run", 5, { kind: "exercise", portion: "30 min" }),
];

test("empty query lists recent items, repeats merged", () => {
  const r = searchHistory(entries, "");
  assert.deepEqual(r.map((x) => x.entry.id), ["4", "3", "2"]);
  assert.equal(r[1].count, 2);
});

test("every word must match, in any order and case", () => {
  assert.deepEqual(searchHistory(entries, "soup FISH").map((x) => x.entry.id), ["3"]);
  assert.deepEqual(searchHistory(entries, "fish").map((x) => x.entry.id), ["4", "3"]);
  assert.deepEqual(searchHistory(entries, "laksa"), []);
});

test("exercise is searched separately", () => {
  assert.deepEqual(searchHistory(entries, "run", "exercise").map((x) => x.entry.id), ["5"]);
  assert.deepEqual(searchHistory(entries, "run"), []);
});
