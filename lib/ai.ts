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
