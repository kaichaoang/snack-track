"use client";

// Meal estimates from Google's Gemini API (free tier), called straight from
// the browser with the user's own key. Uses the Google Search tool so
// restaurant/brand items can be looked up, and accepts an optional photo.

import type { Nutrients } from "./nutrition.ts";
import type { Source } from "./store.ts";

const API = "https://generativelanguage.googleapis.com/v1beta";

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
  /** False when the estimate was made without web search. */
  searched: boolean;
  /** The model that answered (worth trying first next time). */
  model: string;
}

export interface Photo {
  data: string; // base64, no data: prefix
  mimeType: string;
}

const SYSTEM = `You estimate the nutrition of meals for a person in Singapore who is logging food for a calorie-deficit weight-loss plan.

1. Work out what was eaten from the description and/or photo. Split the meal into its distinct parts (e.g. fish, vegetables, broth, rice, sauce, drink).
2. If a restaurant, chain or brand is named (e.g. Super Simple, Subway, Saladstop!, Toast Box, 7-Eleven), use Google Search to find that place's official nutrition information for the exact item. Prefer the official website, menu PDF or app over third-party sites. Otherwise use public food-composition data (Singapore HPB, USDA FoodData Central).
3. Apply the person's adjustments literally: "less rice" ≈ half the usual portion, "a little sauce" ≈ a third, "some soup" ≈ half the bowl, "no X" = leave it out, "extra X" ≈ 1.5×. Use typical Singapore hawker/restaurant portion sizes.
4. Be realistic rather than optimistic, and count cooking oil, sauces and sugary drinks. Round calories to the nearest 5 kcal.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"mealName": string, "confidence": "high"|"medium"|"low", "notes": string (one or two sentences on assumptions and sources), "items": [{"name": string, "portion": string (with approximate grams), "basis": "published"|"database"|"estimate", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "saturatedFatG": number}]}
Use "published" only for figures from the restaurant/brand itself. Use "high" confidence only when official figures matched the exact item and portion.`;

function headers(key: string): HeadersInit {
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

async function apiError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    // Non-JSON error body.
  }
  if (res.status === 400 && /api key/i.test(detail)) return new Error("Your Gemini API key was rejected. Check it in the Goals tab.");
  if (res.status === 403) return new Error("This Gemini key isn't allowed to use that model. Pick another model in the Goals tab.");
  if (res.status === 404) return new Error("That Gemini model isn't available. Pick another model in the Goals tab.");
  if (res.status === 429) return new Error("Gemini's free limit is used up for now. Try again later, or log the offline estimate.");
  return new Error(`Gemini error (${res.status})${detail ? `: ${detail}` : ""}`);
}

/** Models this key can call with generateContent, best Flash model first. */
export async function listModels(key: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?pageSize=200`, { headers: headers(key) });
  } catch {
    throw new Error("Couldn't reach Google. Check your connection.");
  }
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const ids = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => id.startsWith("gemini") && !/(embedding|image|tts|audio|live|robotics|computer|exp)/.test(id));
  return ids.sort((a, b) => modelRank(b) - modelRank(a));
}

/** Prefer Flash (fast, generous free tier), then newer versions; Lite and Pro after. */
function modelRank(id: string): number {
  if (id === "gemini-flash-latest") return 10_000;
  const version = parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  let score = version * 100;
  if (/flash/.test(id) && !/lite/.test(id)) score += 5000;
  else if (/flash-lite/.test(id)) score += 2000;
  if (/preview/.test(id)) score -= 10;
  return score;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Pulls the JSON object out of the model's reply (tolerates ```json fences or stray text). */
export function parseEstimate(text: string): Omit<AiEstimate, "sources" | "searched" | "model"> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini didn't return an estimate. Try rephrasing.");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Couldn't read Gemini's estimate. Try again.");
  }
  const items = Array.isArray(raw.items) ? raw.items : [];
  const parsed: AiItem[] = items.map((it: Record<string, unknown>) => ({
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
  if (parsed.length === 0) throw new Error("Gemini couldn't identify any food. Add more detail.");
  const confidence = raw.confidence === "high" || raw.confidence === "low" ? raw.confidence : "medium";
  return { mealName: String(raw.mealName ?? "Meal"), confidence, notes: String(raw.notes ?? ""), items: parsed };
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

const REQUEST_TIMEOUT_MS = 30_000;

// Set when the key's project has no Google Search allowance (common on
// free-tier keys), so later requests skip straight to the plain call.
let searchUnavailable = false;

class GeminiHttpError extends Error {
  readonly status: number;
  constructor(status: number, err: Error) {
    super(err.message);
    this.status = status;
  }
}

async function generate(key: string, model: string, parts: Record<string, unknown>[], withSearch: boolean): Promise<GenerateResponse> {
  const system = withSearch
    ? SYSTEM
    : `${SYSTEM}\n\nWeb search is not available for this request: use your own knowledge of published restaurant and food-composition figures, and say in notes that figures were not checked online.`;
  let res: Response;
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: headers(key),
      // Overloaded models sometimes hang instead of returning 503.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new GeminiHttpError(504, new Error("Gemini took too long."));
    throw new Error("Couldn't reach Gemini. Check your connection.");
  }
  if (!res.ok) throw new GeminiHttpError(res.status, await apiError(res));
  return (await res.json()) as GenerateResponse;
}

/**
 * Tries `model` with web search, then without search if the key has no
 * search allowance, then the next models in `fallbacks` if a model is busy,
 * slow, retired or has no free quota.
 */
export async function estimateWithGemini(
  key: string,
  model: string,
  description: string,
  photo?: Photo,
  fallbacks: string[] = [],
): Promise<AiEstimate> {
  if (!key) throw new Error("Add your free Gemini API key in the Goals tab first.");
  const parts: Record<string, unknown>[] = [];
  if (photo) parts.push({ inline_data: { mime_type: photo.mimeType, data: photo.data } });
  parts.push({
    text: description.trim()
      ? `What I ate: ${description.trim()}${photo ? "\n(The photo shows the meal.)" : ""}`
      : "Estimate the meal in the photo.",
  });

  const models = [model, ...fallbacks.filter((m) => m !== model && /flash/.test(m))].slice(0, 8);
  let lastError: Error = new Error("Gemini is unavailable right now. Try again in a minute.");
  let body: GenerateResponse | null = null;
  let searched = false;
  let used = model;

  for (const m of models) {
    used = m;
    try {
      if (!searchUnavailable) {
        try {
          body = await generate(key, m, parts, true);
          searched = true;
          break;
        } catch (e) {
          if (!(e instanceof GeminiHttpError && e.status === 429)) throw e;
          // Search quota is zero/used up: carry on without it.
          searchUnavailable = true;
        }
      }
      body = await generate(key, m, parts, false);
      break;
    } catch (e) {
      lastError = e instanceof Error ? e : lastError;
      // Busy, slow, retired or no free quota on this model: try the next one.
      if (!(e instanceof GeminiHttpError && [404, 429, 500, 503, 504].includes(e.status))) throw lastError;
    }
  }
  if (!body) {
    throw lastError instanceof GeminiHttpError && lastError.status !== 404
      ? new Error("Gemini's free models are busy or at their limit right now. Try again in a minute, or log the offline estimate.")
      : lastError;
  }

  if (body.promptFeedback?.blockReason) throw new Error("Gemini declined this request. Try describing the meal differently.");
  const cand = body.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");

  const sources = new Map<string, Source>();
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    if (c.web?.uri) sources.set(c.web.uri, { title: c.web.title ?? c.web.uri, url: c.web.uri });
  }

  return { ...parseEstimate(text), sources: [...sources.values()].slice(0, 6), searched, model: used };
}
