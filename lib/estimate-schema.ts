import { z } from "zod";

// Shared between the /api/estimate route (as the structured-output schema)
// and the client (to type the response).

export const NutrientsSchema = z.object({
  calories: z.number().describe("kcal"),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  sugarG: z.number(),
  sodiumMg: z.number(),
  saturatedFatG: z.number(),
});

export const EstimateItemSchema = z.object({
  name: z.string().describe("Food item as eaten, e.g. 'Chicken rice (roasted), 1 plate'"),
  portion: z.string().describe("Portion description with an approximate weight, e.g. '1 plate, ~350 g'"),
  nutrients: NutrientsSchema,
  basis: z
    .enum(["published", "database", "visual"])
    .describe(
      "published = official figures from the restaurant/brand; database = a public nutrition database (HPB, USDA, Open Food Facts); visual = estimated from the photo/description",
    ),
});

export const EstimateSchema = z.object({
  mealName: z.string().describe("Short name for the whole meal"),
  items: z.array(EstimateItemSchema),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z
    .string()
    .describe("One or two sentences: assumptions made and what would change the estimate most"),
  lighterSwap: z
    .string()
    .describe("One practical, lower-calorie tweak for next time at this place or with this dish"),
});

export type EstimateItem = z.infer<typeof EstimateItemSchema>;
export type Estimate = z.infer<typeof EstimateSchema>;

export interface Source {
  title: string;
  url: string;
}

export interface EstimateResponse {
  estimate: Estimate;
  sources: Source[];
  /** Summary of what the web lookup found, shown to the user. */
  research: string | null;
}
