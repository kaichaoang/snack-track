import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { EstimateSchema, type EstimateResponse, type Source } from "@/lib/estimate-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
// Route a safety-classifier decline to the server's default fallback model
// instead of failing the request.
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];

const RequestSchema = z.object({
  image: z
    .object({
      data: z.string().min(1),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    })
    .optional(),
  description: z.string().max(2000).optional(),
  place: z.string().max(200).optional(),
  lookup: z.boolean().default(true),
});

type EstimateRequest = z.infer<typeof RequestSchema>;

const client = new Anthropic();

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

async function research(req: EstimateRequest): Promise<{ text: string; sources: Source[] }> {
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
      throw new EstimateError("The lookup was declined. Try describing the meal differently.", 422);
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  return { text: text.trim(), sources: [...sources.values()].slice(0, 6) };
}

class EstimateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: Request) {
  let req: EstimateRequest;
  try {
    req = RequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "Server is missing ANTHROPIC_API_KEY. Add it to .env.local." }, { status: 500 });
  }
  if (!req.image && !req.description?.trim()) {
    return Response.json({ error: "Add a photo or a description." }, { status: 400 });
  }

  try {
    let notes: { text: string; sources: Source[] } | null = null;
    if (req.lookup) notes = await research(req);

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
      throw new EstimateError("The estimate was declined. Try describing the meal differently.", 422);
    }
    if (!response.parsed_output) {
      throw new EstimateError("Couldn't read the estimate. Please try again.", 502);
    }

    const body: EstimateResponse = {
      estimate: response.parsed_output,
      sources: notes?.sources ?? [],
      research: notes?.text || null,
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof EstimateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Server is missing a valid ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited. Wait a moment and retry." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return Response.json({ error: "Couldn't reach the AI service. Check your connection." }, { status: 502 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error", error.status, error.message);
      return Response.json({ error: `AI service error (${error.status}).` }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong estimating this meal." }, { status: 500 });
  }
}
