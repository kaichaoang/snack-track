// SnackTrack meal estimate. Runs on Supabase Edge Functions so the AI key
// stays server-side (a project secret) and only allowlisted accounts can use
// it (public.snack_ai_begin checks the session, the allowlist and a daily cap).
//
// Provider: Claude when the ANTHROPIC_API_KEY secret is set, otherwise Gemini
// (GEMINI_API_KEY). The app doesn't know or care which one answered.
//
// Request:  POST { token, description, photo?: { data: base64, mimeType } }
// Response: { estimate: { mealName, confidence, notes, items[] }, sources[] } | { error }

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";

const SYSTEM = `You estimate the nutrition of meals for a person in Singapore who is logging food for a calorie-deficit weight-loss plan. Under-counting quietly ruins a deficit, so your estimates must lean high.

1. Work out what was eaten from the description and/or photo. Split the meal into its distinct parts (e.g. fish, vegetables, broth, rice, sauce, drink). If the description covers more than one meal (breakfast, lunch, dinner, snacks, "this morning", "tonight"), set "meal" on every item to "breakfast", "lunch", "dinner" or "snack"; for a single meal leave "meal" as "".
2. If a restaurant, chain or brand is named (e.g. Super Simple, Subway, Saladstop!, Toast Box, 7-Eleven), look up that place's official nutrition information for the exact item when you can search. Prefer the official website, menu PDF or app. Otherwise use public food-composition data (Singapore HPB, USDA FoodData Central).
3. Apply the person's adjustments literally: "less rice" ≈ half the usual portion, "a little sauce" ≈ a third, "some soup" ≈ half the bowl, "no X" = leave it out, "extra X" ≈ 1.5×.
4. Err on the high side everywhere:
   - Assume generous Singapore hawker/restaurant portions unless told otherwise.
   - Always count cooking oil, lard, sesame/shallot oil, gravy, dressing and sauces, even when not mentioned, unless the person says there were none.
   - Assume drinks are sweetened unless the person says kosong / no sugar / zero.
   - When a figure could fall in a range, use the upper end of the range.
   - Even with official figures, round up rather than down.
   Round calories up to the nearest 5 kcal.
5. Give short, specific feedback for the weight-loss goal: what is good about the meal, and what is not good together with exactly which food or ingredient causes it (e.g. issue "High sodium", cause "the soup broth and chilli sauce"). If the description covers several meals, give this feedback per meal in "mealFeedback" (keys "breakfast", "lunch", "dinner", "snack") and leave "feedback" empty.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"mealName": string, "confidence": "high"|"medium"|"low", "notes": string (one or two plain-language sentences on what you assumed; do not mention tools, search or models), "items": [{"name": string, "portion": string (with approximate grams), "basis": "published"|"database"|"estimate", "meal": ""|"breakfast"|"lunch"|"dinner"|"snack", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "saturatedFatG": number}], "feedback": {"good": [string], "bad": [{"issue": string, "cause": string}]}, "mealFeedback": {"<meal>": {"good": [string], "bad": [{"issue": string, "cause": string}]}}}
Use "published" only for figures from the restaurant/brand itself. Use "high" confidence only when official figures matched the exact item and portion.`;

interface Photo {
  data: string;
  mimeType: string;
}
interface Source {
  title: string;
  url: string;
}
interface Result {
  text: string;
  sources: Source[];
}

class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function beginCall(token: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/rest/v1/rpc/snack_ai_begin`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't check your account.";
    throw new UserError(msg, 403);
  }
}

function userText(description: string, photo?: Photo): string {
  return description.trim()
    ? `What I ate: ${description.trim()}${photo ? "\n(The photo shows the meal.)" : ""}`
    : "Estimate the meal in the photo.";
}

// ---------------------------------------------------------------- Claude

async function withClaude(apiKey: string, description: string, photo?: Photo): Promise<Result> {
  const client = new Anthropic({ apiKey });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: photo.mimeType as "image/jpeg", data: photo.data },
    });
  }
  content.push({ type: "text", text: userText(description, photo) });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];

  const sources = new Map<string, Source>();
  let text = "";
  // A server-tool turn can pause; resend to let it continue (bounded).
  for (let i = 0; i < 4; i++) {
    const response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // On a safety-classifier decline, the server reruns on its default fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 4,
          user_location: { type: "approximate", country: "SG", city: "Singapore", timezone: "Asia/Singapore" },
        },
      ],
      messages,
    });
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") sources.set(c.url, { title: c.title ?? c.url, url: c.url });
        }
      }
    }
    if (response.stop_reason === "refusal") throw new UserError("Couldn't estimate that. Try describing the meal differently.");
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  return { text, sources: [...sources.values()] };
}

// ---------------------------------------------------------------- Gemini

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
let geminiModels: string[] | null = null;
let preferredModel: string | null = null;
let searchUnavailable = false;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function modelRank(id: string): number {
  if (id === "gemini-flash-latest") return 10_000;
  const version = parseFloat(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  let score = version * 100;
  if (/flash/.test(id) && !/lite/.test(id)) score += 5000;
  else if (/flash-lite/.test(id)) score += 2000;
  if (/preview/.test(id)) score -= 10;
  return score;
}

async function listGeminiModels(key: string): Promise<string[]> {
  if (geminiModels) return geminiModels;
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) throw new HttpError(res.status, "Model list failed");
  const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  geminiModels = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => /^gemini.*flash/.test(id) && !/(embedding|image|tts|audio|live|robotics|computer|exp)/.test(id))
    .sort((a, b) => modelRank(b) - modelRank(a));
  return geminiModels;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

async function geminiCall(key: string, model: string, parts: unknown[], withSearch: boolean): Promise<GeminiResponse> {
  const system = withSearch ? SYSTEM : `${SYSTEM}\n\nYou cannot search for this request: use your own knowledge of published figures.`;
  let res: Response;
  try {
    res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(30_000), // overloaded models sometimes hang instead of returning 503
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    });
  } catch {
    throw new HttpError(504, "timeout");
  }
  if (!res.ok) throw new HttpError(res.status, await res.text());
  return (await res.json()) as GeminiResponse;
}

async function withGemini(key: string, description: string, photo?: Photo): Promise<Result> {
  const parts: unknown[] = [];
  if (photo) parts.push({ inline_data: { mime_type: photo.mimeType, data: photo.data } });
  parts.push({ text: userText(description, photo) });

  const all = await listGeminiModels(key);
  const models = [...new Set([preferredModel, ...all].filter((m): m is string => !!m))].slice(0, 8);
  for (const model of models) {
    try {
      let body: GeminiResponse | null = null;
      if (!searchUnavailable) {
        try {
          body = await geminiCall(key, model, parts, true);
        } catch (e) {
          if (!(e instanceof HttpError && e.status === 429)) throw e;
          searchUnavailable = true; // no search allowance on this key
        }
      }
      body ??= await geminiCall(key, model, parts, false);
      preferredModel = model;
      if (body.promptFeedback?.blockReason) throw new UserError("Couldn't estimate that. Try describing the meal differently.");
      const cand = body.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
        .filter((c) => c.web?.uri)
        .map((c) => ({ title: c.web!.title ?? c.web!.uri!, url: c.web!.uri! }));
      return { text, sources };
    } catch (e) {
      // Busy, slow, retired or no quota on this model: try the next one.
      if (e instanceof HttpError && [404, 429, 500, 503, 504].includes(e.status)) continue;
      throw e;
    }
  }
  throw new UserError("The AI is busy right now. Try again in a minute, or log manually.", 503);
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => null)) as { token?: string; description?: string; photo?: Photo } | null;
    const token = body?.token ?? "";
    const description = String(body?.description ?? "").slice(0, 2000);
    const photo = body?.photo && typeof body.photo.data === "string" && /^image\/(jpeg|png|webp)$/.test(body.photo.mimeType)
      ? body.photo
      : undefined;
    if (!token) throw new UserError("Please sign in to use AI estimates.", 401);
    if (!description.trim() && !photo) throw new UserError("Describe the meal or add a photo.");
    if (photo && photo.data.length > 7_000_000) throw new UserError("That photo is too large.");

    await beginCall(token);

    const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    let result: Result;
    if (claudeKey) result = await withClaude(claudeKey, description, photo);
    else if (geminiKey) result = await withGemini(geminiKey, description, photo);
    else throw new UserError("AI estimates aren't set up yet.", 503);

    const start = result.text.indexOf("{");
    const end = result.text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new UserError("Couldn't estimate that. Try adding more detail.", 502);
    let estimate: unknown;
    try {
      estimate = JSON.parse(result.text.slice(start, end + 1));
    } catch {
      throw new UserError("Couldn't estimate that. Please try again.", 502);
    }
    return json({ estimate, sources: result.sources.slice(0, 6) });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "The AI is busy right now. Try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Claude error", e.status, e.message);
      return json({ error: "The AI couldn't answer right now. Try again, or log manually." }, 502);
    }
    console.error(e);
    return json({ error: "Something went wrong. Try again, or log manually." }, 500);
  }
});
