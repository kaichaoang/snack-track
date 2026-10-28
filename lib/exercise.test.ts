import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMinutes, quickExercise, parseExercise, exercisePrompt } from "./exercise.ts";
import { parseAnyReply } from "./ai.ts";

test("parseMinutes", () => {
  assert.equal(parseMinutes("45 min badminton"), 45);
  assert.equal(parseMinutes("1.5 hours hiking"), 90);
  assert.equal(parseMinutes("1h 20 run"), 80);
  assert.equal(parseMinutes("badminton"), null);
});

test("quick estimate is net of resting and rounded down", () => {
  const items = quickExercise("45 min badminton, 20 min brisk walk", 75);
  assert.deepEqual(items.map((i) => i.name), ["Badminton", "Brisk walking"]);
  // badminton: (5.5-1)*75*0.75 = 253.1 -> 250; brisk walk: 3.3*75/3 = 82.5 -> 80
  assert.deepEqual(items.map((i) => i.calories), [250, 80]);
});

test("exercise prompt and reply", () => {
  assert.match(exercisePrompt("swim 30 min", 80), /80 kg/);
  const e = parseExercise({ exercises: [{ name: "Swimming", duration: "30 min", calories: "210.4" }], notes: "conservative" });
  assert.equal(e.items[0].calories, 210);
  assert.throws(() => parseExercise({ exercises: [] }), /Couldn't find/);
});

test("one paste box tells meal and exercise replies apart", () => {
  assert.equal(parseAnyReply('```json\n{"exercises":[{"name":"Run","duration":"30 min","calories":300}]}\n```').kind, "exercise");
  assert.equal(parseAnyReply('{"items":[{"name":"Laksa","calories":600}]}').kind, "food");
  assert.throws(() => parseAnyReply("hello"), /Couldn't find/);
});
