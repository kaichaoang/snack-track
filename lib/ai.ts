"use client";

// AI meal estimates. The app calls our own server function (snack-estimate),
// which holds the AI key and only answers for accounts allowed to use it.

import type { Nutrients } from "./nutrition.ts";
import type { MealSlot, Source } from "./store.ts";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.ts";

export interface AiItem {
  name: string;
  portion: string;
  basis: "published" | "database" | "estimate";
  nutrients: Nutrients;
  /** Which meal it belongs to. */
  meal?: MealSlot;
  /** The dish or drink this part belongs to; each dish is logged as its own entry. */
  dish?: string;
}

const MEALS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function parseFeedback(raw: unknown): Feedback | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const good = (Array.isArray(r.good) ? r.good : []).map(String).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  const bad = (Array.isArray(r.bad) ? r.bad : [])
    .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : { issue: String(b) }))
    .map((b) => ({ issue: String(b.issue ?? "").trim(), cause: String(b.cause ?? "").trim() }))
    .filter((b) => b.issue)
    .slice(0, 5);
  return good.length || bad.length ? { good, bad } : undefined;
}

/** What's good about a meal, and what isn't plus what's causing it. */
export interface Feedback {
  good: string[];
  bad: { issue: string; cause: string }[];
}

export interface AiEstimate {
  mealName: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  items: AiItem[];
  sources: Source[];
  feedback?: Feedback;
  /** Per-meal feedback when the description covered several meals. */
  mealFeedback?: Partial<Record<MealSlot, Feedback>>;
}

export interface Photo {
  data: string; // base64, no data: prefix
  mimeType: string;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Validates the estimate object the server returns (tolerates missing fields). */
export function parseEstimate(raw: unknown): Omit<AiEstimate, "sources"> {
  if (!raw || typeof raw !== "object") throw new Error("Couldn't estimate that. Try adding more detail.");
  const r = raw as Record<string, unknown>;
  const items: AiItem[] = (Array.isArray(r.items) ? r.items : []).map((it: Record<string, unknown>) => ({
    name: String(it.name ?? "Food"),
    portion: String(it.portion ?? "1 serving"),
    basis: it.basis === "published" || it.basis === "database" ? it.basis : "estimate",
    meal: MEALS.includes(String(it.meal).toLowerCase() as MealSlot) ? (String(it.meal).toLowerCase() as MealSlot) : undefined,
    dish: typeof it.dish === "string" && it.dish.trim() ? it.dish.trim() : undefined,
    nutrients: {
      calories: num(it.calories),
      proteinG: num(it.proteinG),
      carbsG: num(it.carbsG),
      fatG: num(it.fatG),
      fiberG: num(it.fiberG),
      sugarG: num(it.sugarG),
      sodiumMg: num(it.sodiumMg),
      saturatedFatG: num(it.saturatedFatG),
    },
  }));
  if (items.length === 0) throw new Error("Couldn't identify any food. Add more detail.");
  const confidence = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  const mealFeedback: Partial<Record<MealSlot, Feedback>> = {};
  if (r.mealFeedback && typeof r.mealFeedback === "object") {
    for (const [k, v] of Object.entries(r.mealFeedback as Record<string, unknown>)) {
      const slot = k.toLowerCase() as MealSlot;
      const fb = parseFeedback(v);
      if (MEALS.includes(slot) && fb) mealFeedback[slot] = fb;
    }
  }
  return {
    mealName: String(r.mealName ?? "Meal"),
    confidence,
    notes: String(r.notes ?? ""),
    items,
    feedback: parseFeedback(r.feedback),
    mealFeedback: Object.keys(mealFeedback).length ? mealFeedback : undefined,
  };
}

export async function estimateMeal(token: string, description: string, photo?: Photo): Promise<AiEstimate> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/snack-estimate`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token, description, photo }),
    });
  } catch {
    throw new Error("You're offline. Log it manually for now.");
  }
  const body = (await res.json().catch(() => null)) as { estimate?: unknown; sources?: Source[]; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error(body?.error ?? "Couldn't estimate that. Try again, or log manually.");
  return { ...parseEstimate(body.estimate), sources: Array.isArray(body.sources) ? body.sources : [] };
}

// ---------------------------------------------------------------- Ask Claude (copy & paste)

/** A ready-to-send prompt for the Claude app, built from the user's description. */
export function claudePrompt(description: string, now: Date = new Date()): string {
  const when = now.toLocaleString("en-SG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return `I'm in Singapore, logging food for a calorie-deficit weight-loss plan. It's ${when} as I log this. Please estimate the nutrition of what I ate:

"${description.trim()}"

How to estimate:
- Split each dish into its parts (e.g. fish, vegetables, broth, rice, sauce).
- Each separate dish or drink becomes its own log entry: set "dish" on every part to the dish it belongs to (e.g. all parts of a fish soup share "dish": "Grouper fish soup"; a frozen yogurt with fruit is a separate dish).
- Set "meal" on every part to "breakfast", "lunch", "dinner" or "snack". Use the meal words I give; otherwise work it out from what I ate and the time I'm logging (e.g. a main dish around midday is lunch; a dessert, frozen yogurt, fruit or drink had separately is a snack).
- If a restaurant, chain or brand is named, search for its official nutrition information for the exact item and use it.
- Apply my wording literally: "less rice" ≈ half the usual portion, "a little" ≈ a third, "some soup" ≈ half the bowl, "no X" = none, "extra X" ≈ 1.5×.
- Err on the high side: assume generous Singapore portions, count cooking oil, sauces and dressings even if I didn't mention them, assume drinks are sweetened unless I say kosong / no sugar, and use the upper end of any range.

Also tell me, briefly and specifically for my weight-loss goal: what's good about this meal, and what's not good together with exactly which food or ingredient is causing it (e.g. high sodium → the soup broth and chilli sauce; lots of saturated fat → the fried shallots and pork lard). If what I ate spans more than one meal, give this feedback separately for each meal in "mealFeedback" (keys "breakfast", "lunch", "dinner", "snack") instead of "feedback".

Give a short breakdown, then end your reply with this JSON block exactly (numbers only, calories rounded up to the nearest 5):

\`\`\`json
{"mealName": "", "confidence": "high|medium|low", "notes": "", "items": [{"name": "", "portion": "", "basis": "published|database|estimate", "dish": "", "meal": "breakfast|lunch|dinner|snack", "calories": 0, "proteinG": 0, "carbsG": 0, "fatG": 0, "fiberG": 0, "sugarG": 0, "sodiumMg": 0, "saturatedFatG": 0}], "feedback": {"good": [""], "bad": [{"issue": "", "cause": ""}]}, "mealFeedback": {}}
\`\`\``;
}

/** Opens Claude with the prompt filled in (falls back to the clipboard copy if the app ignores it). */
export function claudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Reads the estimate out of Claude's pasted reply (the last JSON object in it). */
export function parseClaudeReply(reply: string): Omit<AiEstimate, "sources"> {
  const text = reply.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced.reverse() : [text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      return parseEstimate(JSON.parse(c.slice(start, end + 1)));
    } catch {
      // try the next block
    }
  }
  throw new Error("Couldn't find the numbers in that reply. Copy Claude's whole answer, including the block at the end.");
}
