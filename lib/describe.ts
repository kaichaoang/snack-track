// Turns a free-text meal description into an itemised estimate, offline.
//
//   "grouper fish soup with less rice, a little sauce, some soup"
//   -> sliced fish ×1.2, vegetables ×0.8, fish broth ×0.5, rice ×0.5, sauce ×0.3
//
// The text is split into phrases (commas, "with", "and", "plus"). Each phrase
// is matched against ingredient, composite and dish names (longest first).
// Quantity words or numbers next to a name scale it. A later phrase that names
// something already present, e.g. "some soup" after "fish soup", adjusts that
// part instead of adding another.

import { scaleNutrients, type Nutrients } from "./nutrition.ts";
import { COMPOSITES, INGREDIENTS, type Ingredient } from "./ingredients.ts";
import { DISHES } from "./dishes.ts";

export interface DescribedItem {
  id: string;
  name: string;
  /** Multiple of the default portion. */
  factor: number;
  /** Human-readable amount, e.g. "½ × 1 bowl (~200 g)". */
  amount: string;
  nutrients: Nutrients;
}

export interface Description {
  items: DescribedItem[];
  /** Words that weren't understood, to show the user. */
  unmatched: string[];
}

interface Food {
  id: string;
  name: string;
  portion: string;
  grams?: number;
  pieces?: number;
  group?: string;
  nutrients: Nutrients;
}

type Target = { kind: "food"; food: Food } | { kind: "composite"; parts: { food: Food; factor: number }[] };

const FOODS = new Map<string, Food>();
for (const i of INGREDIENTS) FOODS.set(i.id, i);

/** alias -> target; earlier registrations win, so composites beat dishes. */
const ALIASES = new Map<string, Target>();

function register(alias: string, target: Target) {
  const key = normalize(alias);
  if (key && !ALIASES.has(key)) ALIASES.set(key, target);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9.'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const c of COMPOSITES) {
  const parts = c.parts.map((p) => ({ food: FOODS.get(p.id) as Ingredient, factor: p.factor }));
  for (const a of c.aliases) register(a, { kind: "composite", parts });
}
for (const i of INGREDIENTS) for (const a of i.aliases) register(a, { kind: "food", food: i });

// Whole dishes from the dish list, by their name without the bracketed note.
const DISH_EXTRA_ALIASES: Record<string, string[]> = {
  "Egg fried rice": ["fried rice"],
  "Kopi siew dai (less sugar)": ["kopi less sugar", "kopi siu dai"],
  "Kopi-O kosong (black, no sugar)": ["black coffee", "americano", "kopi o kosong", "kopi-o kosong"],
  "Kopi-O (black, sugar)": ["kopi o"],
  "Kopi-C (evaporated milk + sugar)": ["kopi c"],
  "Kopi (condensed milk + sugar)": ["coffee", "kopi"],
  "Bubble tea, 50% sugar, with pearls": ["bubble tea", "boba", "milk tea"],
  "Soft drink (can)": ["coke", "soft drink", "soda", "sprite", "pepsi"],
  "Laksa": ["curry laksa"],
  "Ondeh ondeh": ["ondeh", "onde onde"],
  "Roti prata (plain)": ["prata", "roti canai"],
};
for (const d of DISHES) {
  const food: Food = { id: `dish:${d.name}`, name: d.name, portion: d.portion, nutrients: d.nutrients };
  for (const a of DISH_EXTRA_ALIASES[d.name] ?? []) register(a, { kind: "food", food });
  register(d.name.replace(/\s*\(.*?\)\s*/g, " "), { kind: "food", food });
}

const SORTED_ALIASES = [...ALIASES.keys()].sort((a, b) => b.length - a.length);

// Quantity words, checked longest first. Values multiply the default portion.
const QUANTITY_WORDS: [string, number][] = (
  [
    ["no", 0], ["without", 0], ["skip", 0], ["zero", 0], ["hold the", 0],
    ["a little bit of", 0.3], ["a little", 0.3], ["little", 0.3], ["a bit of", 0.3], ["a bit", 0.3], ["abit", 0.3],
    ["bit of", 0.3], ["dash of", 0.3], ["drizzle of", 0.3], ["drizzle", 0.3], ["splash of", 0.3], ["touch of", 0.3],
    ["tiny", 0.3], ["very little", 0.2], ["very less", 0.3],
    ["less", 0.5], ["half", 0.5], ["small", 0.5], ["smaller", 0.5], ["some", 0.5], ["few", 0.5], ["a few", 0.5],
    ["light", 0.5], ["lightly", 0.5], ["partial", 0.5],
    ["three quarter", 0.75], ["three quarters", 0.75], ["most of", 0.75], ["most of the", 0.75],
    ["normal", 1], ["regular", 1], ["standard", 1], ["full", 1], ["one", 1], ["a", 1], ["an", 1],
    ["more", 1.5], ["extra", 1.5], ["large", 1.5], ["big", 1.5], ["generous", 1.5], ["lots of", 1.5], ["lot of", 1.5],
    ["a lot of", 1.5], ["plenty of", 1.5], ["heaps of", 1.5], ["add", 1], ["added", 1],
    ["double", 2], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ] as [string, number][]
).sort((a, b) => b[0].length - a[0].length);

// Words that carry no food meaning; never reported as unmatched.
const FILLER = new Set(
  (
    "with and the of on in my i had ate eat have having for at from to some little bit less more extra half " +
    "a an no without side sides plus also then just only about around approx roughly like style " +
    "bowl bowls plate plates cup cups glass portion portions serving servings piece pieces pcs pc slice slices " +
    "steamed boiled grilled baked plain clear hot cold iced ice small big large normal regular sliced " +
    "dry g gm gram grams ml kg x lunch dinner breakfast snack today yesterday"
  ).split(" "),
);

const UNIT_TAIL = /(?:\s+(?:bowls?|plates?|cups?|portions?|servings?|pieces?|slices?|of|the|my))+$/;

function quantityBefore(text: string): number | null {
  const t = text.trim().replace(UNIT_TAIL, "");
  if (!t) return null;
  // "150g", "2", "1.5 bowls", "x2" at the end of the preceding text.
  const num = t.match(/(?:^|\s)x?(\d+(?:\.\d+)?)\s*(g|gm|grams?|ml|pcs?|pieces?|bowls?|plates?|cups?|slices?|servings?|portions?)?\s*(?:of)?$/);
  if (num) return null; // numbers are handled separately (need unit context)
  for (const [w, v] of QUANTITY_WORDS) {
    if (t === w || t.endsWith(` ${w}`)) return v;
  }
  return null;
}

function quantityAfter(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  for (const [w, v] of QUANTITY_WORDS) {
    if (v === 1 && w.length <= 2) continue; // "a"/"an" after a food is noise
    if (t === w || t.startsWith(`${w} `)) return v;
  }
  return null;
}

/** Factor from a number like "150g" or "3" just before the food name. */
function numericFactor(before: string, food: Food): number | null {
  const m = before.trim().match(/(?:^|\s)x?(\d+(?:\.\d+)?)\s*(g|gm|grams?|ml|pcs?|pieces?|bowls?|plates?|cups?|slices?|servings?|portions?)?\s*(?:of)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? "";
  // "yong tau foo 7 pieces bee hoon": a piece count can't apply to bee hoon.
  if (/^(pcs?|pieces?)$/.test(unit) && !food.pieces) return null;
  if (/^(g|gm|grams?|ml)$/.test(unit)) return food.grams ? n / food.grams : null;
  if (food.pieces) return n / food.pieces;
  return n;
}

function fmtFactor(f: number): string {
  const r = Math.round(f * 100) / 100;
  const frac: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾", "0.3": "⅓" };
  return frac[String(r)] ?? String(r);
}

function amount(food: Food, factor: number): string {
  if (Math.abs(factor - 1) < 0.001) return food.portion;
  if (food.grams) return `${fmtFactor(factor)} × ${food.portion} ≈ ${Math.round(food.grams * factor)} g`;
  return `${fmtFactor(factor)} × ${food.portion}`;
}

export function splitPhrases(text: string): string[] {
  return text
    .split(/[,;\n+&/]/)
    .flatMap((part) => normalize(part).split(/\s(?:with|and|plus|w|then)\s/))
    .map((s) => s.replace(/^(?:with|and|plus|then)\s/, "").trim())
    .filter(Boolean);
}

interface Slot {
  food: Food;
  /** Factor the dish itself implies (e.g. 1.2 × fish in fish soup). */
  base: number;
  factor: number;
}

export function describeMeal(text: string): Description {
  const slots: Slot[] = [];
  const unmatched: string[] = [];

  const findExisting = (food: Food) =>
    slots.find((s) => s.food.id === food.id || (food.group && s.food.group === food.group));

  for (const phrase of splitPhrases(text)) {
    // Claim alias matches, longest first, without overlaps.
    const taken: [number, number][] = [];
    const matches: { start: number; end: number; target: Target }[] = [];
    for (const alias of SORTED_ALIASES) {
      const re = new RegExp(`(?<![a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "g");
      for (const m of phrase.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + alias.length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        matches.push({ start, end, target: ALIASES.get(alias)! });
      }
    }
    matches.sort((a, b) => a.start - b.start);

    // Report leftover words that look like food.
    let leftover = phrase;
    for (const m of [...matches].sort((a, b) => b.start - a.start)) {
      leftover = leftover.slice(0, m.start) + " " + leftover.slice(m.end);
    }
    for (const w of leftover.split(/\s+/)) {
      const word = w.replace(/^[-'.]+|[-'.]+$/g, "");
      if (word && !FILLER.has(word) && !/^\d/.test(word) && !QUANTITY_WORDS.some(([q]) => q === word) && word.length > 1) {
        unmatched.push(word);
      }
    }

    const seenInPhrase = new Set<string>();
    // Composites first, so "grouper fish soup" keeps the soup's fish portion.
    const order = matches.map((_, i) => i).sort((a, b) => Number(matches[b].target.kind === "composite") - Number(matches[a].target.kind === "composite"));
    order.forEach((i) => {
      const m = matches[i];
      const before = phrase.slice(i === 0 ? 0 : matches[i - 1].end, m.start);
      const after = phrase.slice(m.end, i + 1 < matches.length ? matches[i + 1].start : phrase.length);
      const qty = quantityBefore(before) ?? (i + 1 === matches.length ? quantityAfter(after) : null);

      const parts = m.target.kind === "composite" ? m.target.parts : [{ food: m.target.food, factor: 1 }];
      for (const part of parts) {
        const num = m.target.kind === "food" ? numericFactor(before, part.food) : null;
        const mult = num ?? qty;
        // "grouper fish soup": fish counted once; "wholemeal toast": one bread.
        const key = part.food.group ?? part.food.id;
        const existing = findExisting(part.food);
        if (seenInPhrase.has(key)) {
          // "poke bowl no rice": an explicit amount still adjusts the part.
          if (m.target.kind === "food" && mult !== null && existing) existing.factor = existing.base * mult;
          continue;
        }
        seenInPhrase.add(key);

        if (existing) {
          // A later mention adjusts the existing part ("some soup", "less rice").
          if (mult !== null) existing.factor = existing.base * mult;
          continue;
        }
        slots.push({ food: part.food, base: part.factor, factor: part.factor * (mult ?? 1) });
      }
    });
  }

  const items = slots
    .filter((s) => s.factor > 0)
    .map((s) => ({
      id: s.food.id,
      name: s.food.name,
      factor: s.factor,
      amount: amount(s.food, s.factor),
      nutrients: scaleNutrients(s.food.nutrients, s.factor),
    }));

  return { items, unmatched: [...new Set(unmatched)] };
}
