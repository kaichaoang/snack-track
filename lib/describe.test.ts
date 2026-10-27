import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMeal } from "./describe.ts";

const byId = (text: string) => Object.fromEntries(describeMeal(text).items.map((i) => [i.id, i.factor]));
const kcal = (text: string) => describeMeal(text).items.reduce((s, i) => s + i.nutrients.calories, 0);

test("grouper fish soup with less rice, a little sauce, some soup", () => {
  const f = byId("grouper fish soup  with less rice, a little sauce, some soup");
  assert.equal(f.fish, 1.2);
  assert.equal(f.veg, 0.8);
  assert.equal(f.fish_broth, 0.5);
  assert.equal(f.rice, 0.5);
  assert.equal(f.sauce, 0.3);
  assert.equal(Object.keys(f).length, 5);
  assert.deepEqual(describeMeal("grouper fish soup  with less rice, a little sauce, some soup").unmatched, []);
});

test("quantities, numbers and grams", () => {
  const f = byId("2 eggs, 150g chicken breast, half bowl brown rice, extra veg");
  assert.equal(f.egg, 2);
  assert.equal(f.chicken_breast, 1.5);
  assert.equal(f.brown_rice, 0.5);
  assert.equal(f.veg, 1.5);
  assert.equal(byId("3 fishballs").fishball, 0.6);
});

test("later mention adjusts a composite's part; no removes it", () => {
  const f = byId("chicken rice, less rice, no chilli");
  assert.equal(f.oily_rice, 0.5);
  assert.equal(f.chilli, undefined);
  assert.equal(f.chicken_rice_chicken, 1);
});

test("whole dishes and drinks match; longest name wins", () => {
  const f = byId("char kway teow and kopi siew dai");
  assert.ok(f["dish:Char kway teow"]);
  assert.ok(f["dish:Kopi siew dai (less sugar)"]);
  assert.equal(Object.keys(f).length, 2);
});

test("unknown words are reported", () => {
  const d = describeMeal("quinoa with salmon");
  assert.deepEqual(d.unmatched, ["quinoa"]);
  assert.equal(d.items.length, 1);
});

test("example totals are plausible", () => {
  const k = kcal("grouper fish soup with less rice, a little sauce, some soup");
  assert.ok(k > 250 && k < 350, String(k));
});

test("in-phrase adjustments and grouping", () => {
  assert.equal(byId("salmon poke bowl no rice").rice, undefined);
  assert.equal(Object.keys(byId("2 slices wholemeal toast")).join(), "wholemeal");
  assert.equal(byId("yong tau foo 7 pieces bee hoon soup").bee_hoon, 1);
});
