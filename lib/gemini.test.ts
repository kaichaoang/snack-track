import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEstimate } from "./gemini.ts";

test("parses JSON inside fences and fills defaults", () => {
  const e = parseEstimate('Here you go:\n```json\n{"mealName":"Fish soup","confidence":"high","notes":"x","items":[{"name":"Fish","portion":"120 g","basis":"published","calories":"130","proteinG":27}]}\n```');
  assert.equal(e.mealName, "Fish soup");
  assert.equal(e.confidence, "high");
  assert.equal(e.items[0].nutrients.calories, 130);
  assert.equal(e.items[0].nutrients.fatG, 0);
  assert.equal(e.items[0].basis, "published");
});

test("rejects replies without an estimate", () => {
  assert.throws(() => parseEstimate("Sorry, I can't help."), /didn't return/);
  assert.throws(() => parseEstimate('{"items": []}'), /couldn't identify/);
});

test("unknown basis/confidence fall back safely", () => {
  const e = parseEstimate('{"confidence":"??","items":[{"name":"Rice","basis":"guess","calories":-5}]}');
  assert.equal(e.confidence, "medium");
  assert.equal(e.items[0].basis, "estimate");
  assert.equal(e.items[0].nutrients.calories, 0);
});
