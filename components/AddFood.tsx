"use client";

import { useState } from "react";
import { EMPTY_NUTRIENTS, scaleNutrients, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { defaultMealSlot, MEAL_SLOTS, newId, type FoodEntry, type MealSlot, type Source } from "@/lib/store";
import { searchFoods, type FoodResult } from "@/lib/foods";
import { searchDishes } from "@/lib/dishes";
import { describeMeal } from "@/lib/describe";

type Mode = "describe" | "dishes" | "packaged" | "manual";

interface Draft {
  key: string;
  name: string;
  portion: string;
  nutrients: Nutrients;
  include: boolean;
}

interface Review {
  origin: FoodEntry["origin"];
  drafts: Draft[];
  sources: Source[];
  /** Log all included items as one entry with this name (free-text meals). */
  combineAs?: string;
}

const PLACE_SUGGESTIONS = ["Super Simple", "Hawker centre", "Kopitiam", "Saladstop!", "Subway", "McDonald's", "Home-cooked"];

const draft = (name: string, portion: string, nutrients: Nutrients): Draft => ({
  key: newId(),
  name,
  portion,
  nutrients: { ...nutrients },
  include: true,
});

export function AddFood({
  date,
  entries,
  onSave,
  onCancel,
}: {
  date: string;
  entries: FoodEntry[];
  onSave: (e: FoodEntry[]) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>("describe");
  const [meal, setMeal] = useState<MealSlot>(defaultMealSlot());
  const [place, setPlace] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [multiplier, setMultiplier] = useState(1);

  function save() {
    if (!review) return;
    const now = Date.now();
    const included = review.drafts.filter((d) => d.include);
    if (review.combineAs && included.length) {
      onSave([
        {
          id: newId(),
          date,
          createdAt: now,
          meal,
          name: review.combineAs,
          portion: (multiplier === 1 ? "" : `×${multiplier} · `) + included.map((d) => d.name.split(" (")[0]).join(", "),
          nutrients: scaleNutrients(sumNutrients(included.map((d) => d.nutrients)), multiplier),
          origin: review.origin,
          place: place.trim() || undefined,
        },
      ]);
      return;
    }
    const added: FoodEntry[] = review.drafts
      .filter((d) => d.include)
      .map((d, i) => ({
        id: newId(),
        date,
        createdAt: now + i,
        meal,
        name: d.name || "Food",
        portion: multiplier === 1 ? d.portion : `${d.portion} ×${multiplier}`,
        nutrients: scaleNutrients(d.nutrients, multiplier),
        origin: review.origin,
        place: place.trim() || undefined,
        sources: review.sources.length ? review.sources : undefined,
      }));
    if (added.length) onSave(added);
  }

  function relog(e: FoodEntry) {
    setPlace(e.place ?? "");
    setMultiplier(1);
    setReview({ origin: e.origin, sources: e.sources ?? [], drafts: [draft(e.name, e.portion, e.nutrients)] });
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <b>Add food</b>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>

      {!review && (
        <>
          <div className="seg" role="group" aria-label="How to add" style={{ marginBottom: 12 }}>
            <button aria-pressed={mode === "describe"} onClick={() => setMode("describe")}>Describe</button>
            <button aria-pressed={mode === "dishes"} onClick={() => setMode("dishes")}>Dishes</button>
            <button aria-pressed={mode === "packaged"} onClick={() => setMode("packaged")}>Packaged</button>
            <button aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>Manual</button>
          </div>
          {mode === "describe" && (
            <DescribePanel
              onUse={(text, drafts) => setReview({ origin: "described", sources: [], drafts, combineAs: text })}
              onManual={() => setMode("manual")}
            />
          )}
          {mode === "dishes" && (
            <DishPanel onPick={(d) => setReview({ origin: "dish", sources: [], drafts: [d] })} />
          )}
          {mode === "packaged" && <PackagedPanel onPick={setReview} />}
          {mode === "manual" && <ManualPanel place={place} setPlace={setPlace} onStart={setReview} />}
          <RecentPanel entries={entries} onPick={relog} />
        </>
      )}

      {review && (
        <ReviewPanel
          review={review}
          setReview={setReview}
          multiplier={multiplier}
          setMultiplier={setMultiplier}
          meal={meal}
          setMeal={setMeal}
          place={place}
          setPlace={setPlace}
          onBack={() => setReview(null)}
          onSave={save}
        />
      )}
    </>
  );
}

/** Distinct foods logged before, most recent first, for one-tap re-logging. */
function RecentPanel({ entries, onPick }: { entries: FoodEntry[]; onPick: (e: FoodEntry) => void }) {
  const seen = new Set<string>();
  const recent: FoodEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    const k = `${e.name}|${e.portion}|${e.place ?? ""}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push(e);
    if (recent.length === 8) break;
  }
  if (recent.length === 0) return null;
  return (
    <section className="card">
      <h2>Recent</h2>
      {recent.map((e) => (
        <button key={e.id} className="block" style={{ textAlign: "left", marginTop: 6 }} onClick={() => onPick(e)}>
          <div className="row between">
            <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.name}
            </span>
            <b className="num">{Math.round(e.nutrients.calories)}</b>
          </div>
          <div className="small muted">
            {e.portion}
            {e.place ? ` · ${e.place}` : ""}
          </div>
        </button>
      ))}
    </section>
  );
}

function DescribePanel({ onUse, onManual }: { onUse: (text: string, drafts: Draft[]) => void; onManual: () => void }) {
  const [text, setText] = useState("");
  const { items, unmatched } = describeMeal(text);
  const total = sumNutrients(items.map((i) => i.nutrients));
  return (
    <section className="card stack">
      <label className="field">
        <span>Describe what you ate, the way you&apos;d say it</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. grouper fish soup with less rice, a little sauce, some soup"
          autoFocus
        />
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        Words like <i>less</i>, <i>a little</i>, <i>some</i>, <i>extra</i>, <i>no</i>, <i>2 eggs</i> or <i>150g chicken</i> adjust
        each part. Works offline.
      </p>
      {items.length > 0 && (
        <div>
          {items.map((i) => (
            <div className="entry" key={i.id}>
              <div className="grow">
                <div className="name">{i.name}</div>
                <div className="meta">{i.amount}</div>
              </div>
              <span className="kcal">{Math.round(i.nutrients.calories)}</span>
            </div>
          ))}
          <div className="row between" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <b>Total</b>
            <b className="num">{Math.round(total.calories)} kcal</b>
          </div>
          <div className="small muted num">
            P {Math.round(total.proteinG)} g · C {Math.round(total.carbsG)} g · F {Math.round(total.fatG)} g
          </div>
        </div>
      )}
      {unmatched.length > 0 && (
        <div className="small" style={{ color: "var(--warn)" }}>
          Didn&apos;t recognise: {unmatched.join(", ")}. Add it as an item on the next screen, or use{" "}
          <button className="ghost small" style={{ padding: 0, color: "var(--accent)" }} onClick={onManual}>Manual</button> for
          restaurant figures.
        </div>
      )}
      <button
        className="primary block"
        disabled={!text.trim()}
        onClick={() =>
          onUse(
            text.trim(),
            items.map((i) => draft(i.name, i.amount, i.nutrients)),
          )
        }
      >
        Review &amp; log
      </button>
    </section>
  );
}

function DishPanel({ onPick }: { onPick: (d: Draft) => void }) {
  const [q, setQ] = useState("");
  const all = searchDishes(q);
  const results = q.trim() ? all : all.slice(0, 12);
  return (
    <section className="card stack">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. chicken rice, laksa, kopi" autoFocus />
      <p className="muted small" style={{ margin: 0 }}>
        Typical values for one standard serving of common Singapore dishes. Portions vary by stall, so adjust on the next
        screen.
      </p>
      {all.length === 0 && <p className="muted small">No match. Try Packaged or Manual.</p>}
      {results.map((d) => (
        <button key={d.name} className="block" style={{ textAlign: "left" }} onClick={() => onPick(draft(d.name, d.portion, d.nutrients))}>
          <div className="row between">
            <b className="grow">{d.name}</b>
            <span className="num">{d.nutrients.calories}</span>
          </div>
          <div className="small muted">{d.portion}</div>
        </button>
      ))}
      {results.length < all.length && (
        <p className="muted small" style={{ margin: 0 }}>Type to search all {all.length} dishes.</p>
      )}
    </section>
  );
}

function ManualPanel({
  place,
  setPlace,
  onStart,
}: {
  place: string;
  setPlace: (s: string) => void;
  onStart: (r: Review) => void;
}) {
  const [name, setName] = useState("");
  const query = [place.trim(), name.trim(), "nutrition facts calories"].filter(Boolean).join(" ");
  return (
    <section className="card stack">
      <p className="muted small" style={{ margin: 0 }}>
        For restaurant meals (e.g. Super Simple), look up the official figures, then type them in. Next time, the meal shows
        up under Recent.
      </p>
      <label className="field">
        <span>Where</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Super Simple" list="places" />
        <datalist id="places">
          {PLACE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
        </datalist>
      </label>
      <label className="field">
        <span>What</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hunter's Bowl" />
      </label>
      <a
        className="block"
        href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
        target="_blank"
        rel="noreferrer"
        style={{ textAlign: "center", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, textDecoration: "none" }}
      >
        Find official nutrition facts ↗
      </a>
      <button
        className="primary block"
        onClick={() => onStart({ origin: "manual", sources: [], drafts: [draft(name.trim(), "1 serving", EMPTY_NUTRIENTS)] })}
      >
        Enter numbers
      </button>
    </section>
  );
}

function PackagedPanel({ onPick }: { onPick: (r: Review) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState(100);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchFoods(term));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  if (picked) {
    const n = scaleNutrients(picked.per100g, grams / 100);
    return (
      <section className="card stack">
        <div>
          <b>{picked.name}</b> <span className="muted small">{picked.brand}</span>
        </div>
        <div className="small muted">
          Per 100 g: {Math.round(picked.per100g.calories)} kcal{picked.servingSize ? ` · serving: ${picked.servingSize}` : ""}
        </div>
        <label className="field">
          <span>Amount eaten (g or ml)</span>
          <input type="number" inputMode="decimal" value={grams} onChange={(e) => setGrams(parseFloat(e.target.value) || 0)} />
        </label>
        {picked.servingGrams && (
          <button onClick={() => setGrams(picked.servingGrams!)}>Use 1 serving ({picked.servingGrams} g)</button>
        )}
        <div className="notice num">{Math.round(n.calories)} kcal · P {n.proteinG.toFixed(1)} · C {n.carbsG.toFixed(1)} · F {n.fatG.toFixed(1)}</div>
        <div className="row">
          <button className="grow" onClick={() => setPicked(null)}>Back</button>
          <button
            className="primary grow"
            disabled={grams <= 0}
            onClick={() =>
              onPick({
                origin: "database",
                sources: [{ title: `Open Food Facts: ${picked.name}`, url: picked.url }],
                drafts: [draft(picked.brand ? `${picked.name} (${picked.brand})` : picked.name, `${grams} g`, n)],
              })
            }
          >
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <form className="row" onSubmit={search}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or barcode number" />
        <button className="primary" disabled={busy}>{busy ? <span className="spinner" /> : "Search"}</button>
      </form>
      <p className="muted small" style={{ margin: 0 }}>Searches Open Food Facts, a free public database of packaged foods.</p>
      {error && <div className="error">{error}</div>}
      {results && results.length === 0 && <p className="muted small">No matches. Try fewer words, or the barcode.</p>}
      {results?.map((r) => (
        <button key={r.code} className="block" style={{ textAlign: "left" }} onClick={() => { setPicked(r); setGrams(r.servingGrams ?? 100); }}>
          <div><b>{r.name}</b> <span className="muted small">{r.brand}</span></div>
          <div className="small muted num">{Math.round(r.per100g.calories)} kcal / 100 g</div>
        </button>
      ))}
    </section>
  );
}

const NUM_FIELDS: { key: keyof Nutrients; label: string }[] = [
  { key: "calories", label: "kcal" },
  { key: "proteinG", label: "Protein g" },
  { key: "carbsG", label: "Carbs g" },
  { key: "fatG", label: "Fat g" },
  { key: "fiberG", label: "Fibre g" },
  { key: "sugarG", label: "Sugar g" },
  { key: "saturatedFatG", label: "Sat fat g" },
  { key: "sodiumMg", label: "Sodium mg" },
];

function ReviewPanel({
  review,
  setReview,
  multiplier,
  setMultiplier,
  meal,
  setMeal,
  place,
  setPlace,
  onBack,
  onSave,
}: {
  review: Review;
  setReview: (r: Review) => void;
  multiplier: number;
  setMultiplier: (n: number) => void;
  meal: MealSlot;
  setMeal: (m: MealSlot) => void;
  place: string;
  setPlace: (s: string) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setReview({ ...review, drafts: review.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)) });
  const total = scaleNutrients(sumNutrients(review.drafts.filter((d) => d.include).map((d) => d.nutrients)), multiplier);

  return (
    <>
      <section className="card">
        <div style={{ fontSize: "1.8rem", fontWeight: 700 }} className="num">
          {Math.round(total.calories)} <span className="muted small">kcal</span>
        </div>
        <div className="small muted num">
          Protein {total.proteinG.toFixed(0)} g · Carbs {total.carbsG.toFixed(0)} g · Fat {total.fatG.toFixed(0)} g · Fibre {total.fiberG.toFixed(0)} g
        </div>
        {review.combineAs && <p style={{ margin: "6px 0 0" }}>“{review.combineAs}”</p>}
        {(review.origin === "dish" || review.origin === "described") && (
          <p className="small muted" style={{ marginBottom: 0 }}>Typical values. Adjust the portion if yours was bigger or smaller.</p>
        )}
        {review.sources.length > 0 && (
          <ol className="sources">
            {review.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
            ))}
          </ol>
        )}
      </section>

      <section className="card stack">
        <label className="field">
          <span>How much did you eat?</span>
        </label>
        <div className="seg" role="group" aria-label="Portion">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => (
            <button key={m} aria-pressed={multiplier === m} onClick={() => setMultiplier(m)}>×{m}</button>
          ))}
        </div>

        {review.drafts.map((d) => (
          <div className="item-edit" key={d.key} style={{ opacity: d.include ? 1 : 0.5 }}>
            <div className="row">
              <input type="checkbox" checked={d.include} onChange={(e) => updateDraft(d.key, { include: e.target.checked })} style={{ width: "auto" }} aria-label="Include" />
              <input className="grow" value={d.name} placeholder="Food name" onChange={(e) => updateDraft(d.key, { name: e.target.value })} />
            </div>
            <div className="row" style={{ margin: "6px 0" }}>
              <input className="grow small" value={d.portion} onChange={(e) => updateDraft(d.key, { portion: e.target.value })} aria-label="Portion" />
            </div>
            <div className="mini-grid">
              {NUM_FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span>{f.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={Math.round(d.nutrients[f.key] * 10) / 10}
                    onChange={(e) => updateDraft(d.key, { nutrients: { ...d.nutrients, [f.key]: parseFloat(e.target.value) || 0 } })}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setReview({ ...review, drafts: [...review.drafts, draft("", "1 serving", EMPTY_NUTRIENTS)] })}>
          + Add another item
        </button>
      </section>

      <section className="card stack">
        <div className="grid2">
          <label className="field">
            <span>Meal</span>
            <select value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)}>
              {MEAL_SLOTS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Place</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="optional" />
          </label>
        </div>
        <div className="row">
          <button className="grow" onClick={onBack}>Back</button>
          <button className="primary grow" onClick={onSave} disabled={!review.drafts.some((d) => d.include)}>Log it</button>
        </div>
      </section>
    </>
  );
}
