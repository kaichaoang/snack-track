"use client";

// Packaged-food lookup via Open Food Facts (public, crowd-sourced database),
// called from the browser; the API allows cross-origin requests.

import type { Nutrients } from "./nutrition";

const OFF = "https://world.openfoodfacts.org";
const FIELDS = "code,product_name,brands,serving_size,serving_quantity,nutriments";

export interface FoodResult {
  code: string;
  name: string;
  brand: string;
  servingSize: string | null;
  servingGrams: number | null;
  per100g: Nutrients;
  url: string;
}

type OffNutriments = Record<string, number | string | undefined>;

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

function num(n: OffNutriments, key: string): number {
  const v = Number(n[key]);
  return Number.isFinite(v) ? v : 0;
}

function toResult(p: OffProduct): FoodResult | null {
  const n = p.nutriments ?? {};
  let kcal = num(n, "energy-kcal_100g");
  if (!kcal && num(n, "energy_100g")) kcal = num(n, "energy_100g") / 4.184; // kJ -> kcal
  if (!p.code || !p.product_name || !kcal) return null;
  const servingGrams = Number(p.serving_quantity);
  return {
    code: p.code,
    name: p.product_name,
    brand: p.brands?.split(",")[0]?.trim() ?? "",
    servingSize: p.serving_size ?? null,
    servingGrams: Number.isFinite(servingGrams) && servingGrams > 0 ? servingGrams : null,
    per100g: {
      calories: kcal,
      proteinG: num(n, "proteins_100g"),
      carbsG: num(n, "carbohydrates_100g"),
      fatG: num(n, "fat_100g"),
      fiberG: num(n, "fiber_100g"),
      sugarG: num(n, "sugars_100g"),
      sodiumMg: num(n, "sodium_100g") * 1000,
      saturatedFatG: num(n, "saturated-fat_100g"),
    },
    url: `${OFF}/product/${p.code}`,
  };
}

/** Search by product name, or by barcode when the query is all digits. */
export async function searchFoods(query: string): Promise<FoodResult[]> {
  const term = query.trim();
  const barcode = /^\d{8,14}$/.test(term) ? term : null;
  let res: Response;
  try {
    if (barcode) {
      res = await fetch(`${OFF}/api/v2/product/${barcode}.json?fields=${FIELDS}`);
      if (res.status === 404) return [];
    } else {
      const url = new URL(`${OFF}/cgi/search.pl`);
      url.search = new URLSearchParams({
        search_terms: term,
        search_simple: "1",
        json: "1",
        page_size: "15",
        fields: FIELDS,
      }).toString();
      res = await fetch(url);
    }
  } catch {
    throw new Error("Food database is unavailable.");
  }
  if (!res.ok) throw new Error("Food database is unavailable.");

  if (barcode) {
    const data = (await res.json()) as { product?: OffProduct };
    const r = data.product ? toResult({ code: barcode, ...data.product }) : null;
    return r ? [r] : [];
  }
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(toResult).filter((r): r is FoodResult => r !== null);
}
