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

import { claudePrompt, parseClaudeReply } from "./ai.ts";

test("Claude prompt includes the description and the JSON shape", () => {
  const p = claudePrompt("  fish soup, less rice ");
  assert.match(p, /"fish soup, less rice"/);
  assert.match(p, /"sodiumMg"/);
});

test("parses Claude's pasted reply (last JSON block, smart quotes ok)", () => {
  const reply = `Here's the breakdown...\n\n\`\`\`json\n{“mealName”: “Fish soup”, “confidence”: “medium”, “notes”: “”, “items”: [{“name”: “Fish”, “portion”: “120 g”, “basis”: “database”, “calories”: 140, “proteinG”: 28, “sodiumMg”: 900}]}\n\`\`\``;
  const e = parseClaudeReply(reply);
  assert.equal(e.mealName, "Fish soup");
  assert.equal(e.items[0].nutrients.calories, 140);
  assert.equal(e.items[0].nutrients.sodiumMg, 900);
  assert.throws(() => parseClaudeReply("no numbers here"), /Couldn't find/);
});

test("items keep their meal when the reply spans several meals", () => {
  const e = parseClaudeReply('{"mealName":"Day","items":[{"name":"Kaya toast","meal":"Breakfast","calories":300},{"name":"Fish soup","meal":"lunch","calories":400},{"name":"Rice","meal":"","calories":200}]}');
  assert.deepEqual(e.items.map((i) => i.meal), ["breakfast", "lunch", undefined]);
});

test("feedback is parsed and cleaned", () => {
  const e = parseClaudeReply('{"items":[{"name":"Laksa","calories":600}],"feedback":{"good":["Decent protein",""],"bad":[{"issue":"High sodium","cause":"the laksa gravy"},{"issue":"","cause":"x"}]}}');
  assert.deepEqual(e.feedback, { good: ["Decent protein"], bad: [{ issue: "High sodium", cause: "the laksa gravy" }] });
  assert.equal(parseClaudeReply('{"items":[{"name":"x","calories":1}]}').feedback, undefined);
});

test("per-meal feedback", () => {
  const e = parseClaudeReply('{"items":[{"name":"Toast","meal":"breakfast","calories":300}],"mealFeedback":{"Breakfast":{"good":["ok"],"bad":[]},"brunch":{"good":["x"]}}}');
  assert.deepEqual(e.mealFeedback, { breakfast: { good: ["ok"], bad: [] } });
});
