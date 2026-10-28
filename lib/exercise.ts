// Exercise: calories burned, deliberately on the low side (over-counting burn
// quietly cancels a deficit). Only calories above resting are counted, since
// resting burn is already part of maintenance.

export interface ExerciseItem {
  name: string;
  /** e.g. "45 min". */
  duration: string;
  /** Net kcal burned above resting. */
  calories: number;
}

export interface ExerciseEstimate {
  items: ExerciseItem[];
  notes: string;
}

// MET values (Compendium of Physical Activities, moderate effort), checked
// longest name first so "brisk walk" beats "walk".
const METS: [string[], number, string][] = [
  [["brisk walk", "brisk walking", "power walk"], 4.3, "Brisk walking"],
  [["walk", "walking", "stroll"], 3.0, "Walking"],
  [["hike", "hiking", "trek"], 5.3, "Hiking"],
  [["jog", "jogging"], 7.0, "Jogging"],
  [["run", "running", "ran"], 8.3, "Running"],
  [["cycle", "cycling", "bike", "biking", "spin"], 6.8, "Cycling"],
  [["swim", "swimming", "laps"], 5.8, "Swimming"],
  [["badminton"], 5.5, "Badminton"],
  [["tennis"], 7.3, "Tennis"],
  [["pickleball"], 4.5, "Pickleball"],
  [["football", "soccer", "futsal"], 7.0, "Football"],
  [["basketball"], 6.5, "Basketball"],
  [["hiit", "circuit", "crossfit", "bootcamp"], 8.0, "HIIT"],
  [["weights", "weight training", "gym", "lifting", "strength"], 3.5, "Weight training"],
  [["yoga", "stretching", "pilates"], 2.5, "Yoga / stretching"],
  [["dance", "dancing", "zumba"], 5.0, "Dancing"],
  [["climb", "climbing", "bouldering"], 5.8, "Climbing"],
  [["stairs", "stair climbing"], 4.0, "Stairs"],
  [["rowing", "row"], 6.0, "Rowing"],
  [["skipping", "jump rope"], 8.8, "Skipping"],
];

/** Minutes from text like "45 min", "1h", "1.5 hours", "1 hr 20". */
export function parseMinutes(text: string): number | null {
  const t = text.toLowerCase();
  const hm = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b(?:\s*(\d+)\s*(?:m|min|mins|minutes)?)?/);
  if (hm) return Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0));
  const m = t.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (m) return parseInt(m[1], 10);
  const bare = t.match(/\b(\d{2,3})\b/);
  return bare ? parseInt(bare[1], 10) : null;
}

/** Offline estimate: each phrase ("45 min badminton, 20 min walk") → net kcal from MET. */
export function quickExercise(text: string, weightKg: number): ExerciseItem[] {
  const items: ExerciseItem[] = [];
  for (const phrase of text.split(/,|;|\band\b|\bthen\b|\+|\n/)) {
    const p = phrase.toLowerCase().trim();
    if (!p) continue;
    const match = METS.flatMap(([names, met, label]) => names.map((n) => ({ n, met, label })))
      .sort((a, b) => b.n.length - a.n.length)
      .find(({ n }) => new RegExp(`\\b${n}\\b`).test(p));
    const minutes = parseMinutes(p);
    if (!match || !minutes) continue;
    // Net of resting (MET − 1), rounded down to the nearest 5.
    const kcal = Math.floor(((match.met - 1) * weightKg * (minutes / 60)) / 5) * 5;
    items.push({ name: match.label, duration: `${minutes} min`, calories: Math.max(0, kcal) });
  }
  return items;
}

export function exercisePrompt(description: string, weightKg: number, now: Date = new Date()): string {
  const when = now.toLocaleString("en-SG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return `I'm tracking a calorie deficit to lose weight and I weigh about ${Math.round(weightKg)} kg. It's ${when}. Please estimate the calories I burned doing:

"${description.trim() || "(describe your exercise here, with how long you did it)"}"

How to estimate:
- One item per activity, with its duration.
- Count only the calories burned ABOVE resting (my resting burn is already counted in my maintenance calories).
- Be conservative: fitness trackers and gym machines usually overestimate, so use the lower end of any range and assume moderate effort unless I say otherwise.

Give a short explanation, then end your reply with this JSON block exactly (calories rounded down to the nearest 5):

\`\`\`json
{"exercises": [{"name": "", "duration": "", "calories": 0}], "notes": ""}
\`\`\``;
}

export function parseExercise(raw: unknown): ExerciseEstimate {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(r.exercises) ? r.exercises : [])
    .map((x: Record<string, unknown>) => ({
      name: String(x?.name ?? "").trim() || "Exercise",
      duration: String(x?.duration ?? "").trim(),
      calories: Math.max(0, Math.round(Number(x?.calories) || 0)),
    }))
    .filter((x) => x.calories > 0 || x.duration);
  if (items.length === 0) throw new Error("Couldn't find any exercise in that reply.");
  return { items, notes: String(r.notes ?? "") };
}
