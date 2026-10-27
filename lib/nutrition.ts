// Pure nutrition math: energy targets, macro targets and day totals.
// Kept free of React/browser APIs so it can be unit tested with node --test.

export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (desk job, little exercise)",
  light: "Light (exercise 1–3 days/week)",
  moderate: "Moderate (exercise 3–5 days/week)",
  active: "Active (hard exercise 6–7 days/week)",
  very_active: "Very active (physical job + training)",
};

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activity: ActivityLevel;
  /** Target loss in kg per week, e.g. 0.5. */
  weeklyLossKg: number;
}

export interface Nutrients {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  saturatedFatG: number;
}

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
  "saturatedFatG",
];

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
  saturatedFatG: 0,
};

/** Energy in 1 kg of body fat, the standard rule-of-thumb figure. */
export const KCAL_PER_KG_FAT = 7700;

/** Mifflin–St Jeor basal metabolic rate, kcal/day. */
export function bmr(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure, kcal/day. */
export function tdee(p: Profile): number {
  return bmr(p) * ACTIVITY_FACTORS[p.activity];
}

/** Lowest daily intake we will suggest without medical supervision. */
export function calorieFloor(sex: Sex): number {
  return sex === "male" ? 1500 : 1200;
}

export interface Targets {
  bmr: number;
  tdee: number;
  /** Daily calorie target after the deficit (and floor) is applied. */
  calories: number;
  /** The deficit actually achievable at that target. */
  dailyDeficit: number;
  /** True when the requested loss rate was capped by the calorie floor. */
  cappedByFloor: boolean;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  /** Upper limits rather than goals. */
  sugarMaxG: number;
  sodiumMaxMg: number;
  saturatedFatMaxG: number;
}

export function targets(p: Profile): Targets {
  const b = bmr(p);
  const t = tdee(p);
  const wanted = (p.weeklyLossKg * KCAL_PER_KG_FAT) / 7;
  const floor = calorieFloor(p.sex);
  const raw = t - wanted;
  const calories = Math.max(raw, floor);
  const dailyDeficit = t - calories;

  // Higher protein preserves lean mass in a deficit: ~1.8 g/kg of goal weight.
  const proteinG = 1.8 * Math.min(p.weightKg, p.goalWeightKg || p.weightKg);
  // ~28% of energy from fat, remainder carbs.
  const fatG = (calories * 0.28) / 9;
  const carbsG = Math.max(0, (calories - proteinG * 4 - fatG * 9) / 4);
  // 14 g fibre per 1000 kcal (dietary guidelines), at least 25 g.
  const fiberG = Math.max(25, (calories / 1000) * 14);

  return {
    bmr: b,
    tdee: t,
    calories,
    dailyDeficit,
    cappedByFloor: raw < floor,
    proteinG,
    fatG,
    carbsG,
    fiberG,
    // WHO: free sugars < 10% energy; HPB/WHO sodium < 2000 mg; sat fat < 10% energy.
    sugarMaxG: (calories * 0.1) / 4,
    sodiumMaxMg: 2000,
    saturatedFatMaxG: (calories * 0.1) / 9,
  };
}

/** Weeks to reach goal at the achievable deficit, or null if not losing. */
export function weeksToGoal(p: Profile, dailyDeficit: number): number | null {
  const toLose = p.weightKg - p.goalWeightKg;
  if (toLose <= 0) return 0;
  if (dailyDeficit <= 0) return null;
  return (toLose * KCAL_PER_KG_FAT) / (dailyDeficit * 7);
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = { ...EMPTY_NUTRIENTS };
  for (const k of NUTRIENT_KEYS) out[k] = (n[k] || 0) * factor;
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(addNutrients, { ...EMPTY_NUTRIENTS });
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late dinners land on the right day). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Exponentially smoothed weight trend (as in "The Hacker's Diet"), which hides
 * day-to-day water swings. Input must be sorted by date ascending.
 */
export function weightTrend(
  entries: { date: string; kg: number }[],
  alpha = 0.1,
): { date: string; kg: number; trend: number }[] {
  let trend: number | null = null;
  return entries.map((e) => {
    trend = trend === null ? e.kg : trend + alpha * (e.kg - trend);
    return { ...e, trend };
  });
}
