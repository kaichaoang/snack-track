import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bmr,
  targets,
  weeksToGoal,
  sumNutrients,
  scaleNutrients,
  localDateKey,
  weightTrend,
  EMPTY_NUTRIENTS,
  type Profile,
} from "./nutrition.ts";

const base: Profile = {
  sex: "male",
  age: 30,
  heightCm: 175,
  weightKg: 85,
  goalWeightKg: 75,
  activity: "moderate",
  weeklyLossKg: 0.5,
};

test("Mifflin-St Jeor BMR", () => {
  // 10*85 + 6.25*175 - 5*30 + 5 = 1798.75
  assert.equal(bmr(base), 1798.75);
  assert.equal(bmr({ ...base, sex: "female" }), 1798.75 - 166);
});

test("targets apply a 0.5 kg/week deficit", () => {
  const t = targets(base);
  assert.ok(Math.abs(t.tdee - 1798.75 * 1.55) < 1e-9);
  assert.ok(Math.abs(t.dailyDeficit - 550) < 1e-9);
  assert.equal(t.cappedByFloor, false);
  // Macros add back up to the calorie target.
  const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
  assert.ok(Math.abs(kcal - t.calories) < 1e-6);
});

test("aggressive loss is capped at the calorie floor", () => {
  const t = targets({ ...base, sex: "female", weightKg: 55, heightCm: 155, activity: "sedentary", weeklyLossKg: 1 });
  assert.equal(t.calories, 1200);
  assert.equal(t.cappedByFloor, true);
  assert.ok(t.dailyDeficit < 1000);
});

test("weeksToGoal", () => {
  assert.ok(Math.abs(weeksToGoal(base, 550)! - 20) < 1e-9);
  assert.equal(weeksToGoal({ ...base, goalWeightKg: 90 }, 550), 0);
  assert.equal(weeksToGoal(base, 0), null);
});

test("sum and scale nutrients", () => {
  const a = { ...EMPTY_NUTRIENTS, calories: 300, proteinG: 20 };
  const b = { ...EMPTY_NUTRIENTS, calories: 200, fatG: 5 };
  const s = sumNutrients([a, b]);
  assert.equal(s.calories, 500);
  assert.equal(s.proteinG, 20);
  assert.equal(s.fatG, 5);
  assert.equal(scaleNutrients(a, 1.5).calories, 450);
});

test("localDateKey uses local calendar date", () => {
  assert.equal(localDateKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("weightTrend smooths", () => {
  const out = weightTrend([
    { date: "2026-01-01", kg: 80 },
    { date: "2026-01-02", kg: 82 },
  ]);
  assert.equal(out[0].trend, 80);
  assert.ok(Math.abs(out[1].trend - 80.2) < 1e-9);
});

test("dish list: macros roughly match calories, search works", async () => {
  const { DISHES, searchDishes } = await import("./dishes.ts");
  for (const d of DISHES) {
    const n = d.nutrients;
    const fromMacros = n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
    // Within 15% or 30 kcal (rounding, alcohol-free, fibre counted in carbs).
    assert.ok(Math.abs(fromMacros - n.calories) <= Math.max(30, n.calories * 0.15), `${d.name}: ${fromMacros} vs ${n.calories}`);
  }
  assert.ok(searchDishes("chicken rice").some((d) => d.name.startsWith("Chicken rice")));
  assert.ok(searchDishes("KOPI siew").length === 1);
});
