"use client";

// Meal estimates, called straight from the browser with the user's own
// Anthropic API key (the app is a static site with no server of its own).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EstimateSchema, type EstimateResponse, type Source } from "./estimate-schema";

const MODEL = "claude-opus-5-5";
// Route a safety-classifier decline to the server's default fallback model
// instead of failing the request.
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];

export interface EstimateRequest {
  image?: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };
  description?: string;
  place?: string;
  lookup: boolean;
}

function userContent(req: EstimateRequest, extra: string): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: req.image.mediaType, data: req.image.data },
    });
  }
  const lines = [
    req.place ? `Where it was eaten / bought: ${req.place}` : null,
    req.description ? `What I ate (my description): ${req.description}` : null,
    req.image ? "The photo above shows the meal." : null,
    extra,
  ].filter(Boolean);
  content.push({ type: "text", text: lines.join("\n\n") });
  return content;
}

const RESEARCH_SYSTEM = `You help a person in Singapore log meals for a calorie-deficit weight-loss plan.
Your job in this step is research only: find published nutrition facts for what they ate.

- First identify the dish(es) from the photo and/or description.
- If a restaurant, chain or brand is named (e.g. Super Simple, Subway, Saladstop!, Kopitiam stalls, 7-Eleven), search for that place's official nutrition information for the specific item, including menu pages, PDFs or app listings. Prefer the official source over third-party sites.
- If no place is named or the place publishes nothing, look up a public database figure for the closest dish: Singapore HPB Energy & Nutrient Composition of Food, then USDA FoodData Central, then Open Food Facts for packaged goods.
- Note the serving size each figure refers to, so it can be scaled to the portion in the photo.
- Report the figures you found, the serving size and where each came from, briefly. If you found nothing reliable, say so plainly. Do not invent numbers.`;

const ESTIMATE_SYSTEM = `You estimate the nutrition of a meal for someone tracking a calorie deficit.
Return one entry per distinct food or drink in the meal.

- When research notes contain published figures for the item, use them (basis "published" or "database"), scaled to the portion actually shown or described.
- Otherwise estimate from the photo and description (basis "visual"): judge portion size from plate, cutlery and packaging cues, and count cooking oil, sauces, dressings and sugary drinks, which are the usual hidden calories.
- Be realistic, not optimistic: under-counting undermines a deficit. Round calories to the nearest 5 kcal and grams to one decimal place.
- Sodium is in milligrams. If a value is unknown, give your best estimate rather than 0.
- Set confidence to "high" only when official figures matched the exact item and portion.`;

async function research(client: Anthropic, req: EstimateRequest): Promise<{ text: string; sources: Source[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: userContent(req, "Find the nutrition facts for this meal.") },
  ];
  const sources = new Map<string, Source>();
  let text = "";

  // A server-tool turn can pause; resend to let it continue (bounded).
  for (let i = 0; i < 4; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 5,
          user_location: { type: "approximate", country: "SG", city: "Singapore", timezone: "Asia/Singapore" },
        },
      ],
      messages,
    });

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") {
            sources.set(c.url, { title: c.title ?? c.url, url: c.url });
          }
        }
      }
    }

    if (response.stop_reason === "refusal") {
      throw new Error("The lookup was declined. Try describing the meal differently.");
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  return { text: text.trim(), sources: [...sources.values()].slice(0, 6) };
}

/** Runs the (optional) web lookup, then the structured estimate. Throws Error with a user-facing message. */
export async function estimateMeal(apiKey: string, req: EstimateRequest): Promise<EstimateResponse> {
  if (!apiKey) throw new Error("Add your Anthropic API key in the Goals tab first.");
  if (!req.image && !req.description?.trim()) throw new Error("Add a photo or a description.");

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const notes = req.lookup ? await research(client, req) : null;

    const extra = notes?.text
      ? `Research notes from a web lookup:\n<research>\n${notes.text}\n</research>\n\nEstimate the nutrition of this meal.`
      : "Estimate the nutrition of this meal.";

    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(EstimateSchema) },
      system: ESTIMATE_SYSTEM,
      messages: [{ role: "user", content: userContent(req, extra) }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The estimate was declined. Try describing the meal differently.");
    }
    if (!response.parsed_output) throw new Error("Couldn't read the estimate. Please try again.");

    return {
      estimate: response.parsed_output,
      sources: notes?.sources ?? [],
      research: notes?.text || null,
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("Your Anthropic API key was rejected. Check it in the Goals tab.");
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new Error("Your API key isn't allowed to use this model or web search.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("Rate limited. Wait a moment and retry.");
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new Error("Couldn't reach the AI service. Check your connection.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`AI service error (${error.status}): ${error.message}`);
    }
    throw error;
  }
}
