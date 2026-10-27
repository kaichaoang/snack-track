import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEstimate } from "./ai.ts";

test("parses an estimate and fills defaults", () => {
  const e = parseEstimate({ mealName: "Fish soup", confidence: "high", notes: "x", items: [{ name: "Fish", portion: "120 g", basis: "published", calories: "130", proteinG: 27 }] });
  assert.equal(e.mealName, "Fish soup");
  assert.equal(e.confidence, "high");
  assert.equal(e.items[0].nutrients.calories, 130);
  assert.equal(e.items[0].nutrients.fatG, 0);
  assert.equal(e.items[0].basis, "published");
});

test("rejects empty or missing estimates", () => {
  assert.throws(() => parseEstimate(null), /Couldn't estimate/);
  assert.throws(() => parseEstimate({ items: [] }), /Couldn't identify/);
});

test("unknown basis/confidence fall back safely", () => {
  const e = parseEstimate({ confidence: "??", items: [{ name: "Rice", basis: "guess", calories: -5 }] });
  assert.equal(e.confidence, "medium");
  assert.equal(e.items[0].basis, "estimate");
  assert.equal(e.items[0].nutrients.calories, 0);
});
