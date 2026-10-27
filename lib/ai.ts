"use client";

// AI meal estimates. The app calls our own server function (snack-estimate),
// which holds the AI key and only answers for accounts allowed to use it.

import type { Nutrients } from "./nutrition.ts";
import type { Source } from "./store.ts";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.ts";

export interface AiItem {
  name: string;
  portion: string;
  basis: "published" | "database" | "estimate";
  nutrients: Nutrients;
}

export interface AiEstimate {
  mealName: string;
  confidence: "high" | "medium" | "low";
  notes: string;
  items: AiItem[];
  sources: Source[];
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
  return { mealName: String(r.mealName ?? "Meal"), confidence, notes: String(r.notes ?? ""), items };
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
export function claudePrompt(description: string): string {
  return `I'm in Singapore, logging food for a calorie-deficit weight-loss plan. Please estimate the nutrition of this meal:

"${description.trim()}"

How to estimate:
- Split the meal into its parts (e.g. fish, vegetables, broth, rice, sauce, drink).
- If a restaurant, chain or brand is named, search for its official nutrition information for the exact item and use it.
- Apply my wording literally: "less rice" ≈ half the usual portion, "a little" ≈ a third, "some soup" ≈ half the bowl, "no X" = none, "extra X" ≈ 1.5×.
- Err on the high side: assume generous Singapore portions, count cooking oil, sauces and dressings even if I didn't mention them, assume drinks are sweetened unless I say kosong / no sugar, and use the upper end of any range.

Give a short breakdown, then end your reply with this JSON block exactly (numbers only, calories rounded up to the nearest 5):

\`\`\`json
{"mealName": "", "confidence": "high|medium|low", "notes": "", "items": [{"name": "", "portion": "", "basis": "published|database|estimate", "calories": 0, "proteinG": 0, "carbsG": 0, "fatG": 0, "fiberG": 0, "sugarG": 0, "sodiumMg": 0, "saturatedFatG": 0}]}
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
