"use client";

import { useRef, useState } from "react";
import { EMPTY_NUTRIENTS, scaleNutrients, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { defaultMealSlot, MEAL_SLOTS, newId, type FoodEntry, type MealSlot } from "@/lib/store";
import { resizeImage } from "@/lib/image";
import type { Estimate, EstimateResponse, Source } from "@/lib/estimate-schema";
import type { FoodResult } from "@/app/api/foods/route";

type Mode = "snap" | "search" | "manual";

interface Draft {
  key: string;
  name: string;
  portion: string;
  nutrients: Nutrients;
  basis?: string;
  include: boolean;
}

interface Review {
  origin: FoodEntry["origin"];
  drafts: Draft[];
  sources: Source[];
  estimate?: Estimate;
  research?: string | null;
}

const PLACE_SUGGESTIONS = ["Super Simple", "Hawker centre", "Kopitiam", "Saladstop!", "Subway", "McDonald's", "Home-cooked"];

export function AddFood({ date, onSave, onCancel }: { date: string; onSave: (e: FoodEntry[]) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>("snap");
  const [meal, setMeal] = useState<MealSlot>(defaultMealSlot());
  const [place, setPlace] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [multiplier, setMultiplier] = useState(1);

  function save() {
    if (!review) return;
    const now = Date.now();
    const entries: FoodEntry[] = review.drafts
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
    if (entries.length) onSave(entries);
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
            <button aria-pressed={mode === "snap"} onClick={() => setMode("snap")}>📷 Photo / describe</button>
            <button aria-pressed={mode === "search"} onClick={() => setMode("search")}>🔎 Packaged</button>
            <button aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>✏️ Manual</button>
          </div>
          {mode === "snap" && <SnapPanel place={place} setPlace={setPlace} onResult={setReview} />}
          {mode === "search" && <SearchPanel onPick={setReview} />}
          {mode === "manual" && (
            <section className="card">
              <p className="muted small" style={{ marginTop: 0 }}>Enter the numbers from a label or menu.</p>
              <button
                className="primary block"
                onClick={() =>
                  setReview({
                    origin: "manual",
                    sources: [],
                    drafts: [{ key: newId(), name: "", portion: "1 serving", nutrients: { ...EMPTY_NUTRIENTS }, include: true }],
                  })
                }
              >
                Start
              </button>
            </section>
          )}
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

function SnapPanel({
  place,
  setPlace,
  onResult,
}: {
  place: string;
  setPlace: (s: string) => void;
  onResult: (r: Review) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ data: string; mediaType: "image/jpeg"; previewUrl: string } | null>(null);
  const [description, setDescription] = useState("");
  const [lookup, setLookup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await resizeImage(file));
    } catch {
      setError("Couldn't read that image.");
    }
  }

  async function estimate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: photo ? { data: photo.data, mediaType: photo.mediaType } : undefined,
          description: description.trim() || undefined,
          place: place.trim() || undefined,
          lookup,
        }),
      });
      const body = (await res.json()) as EstimateResponse | { error: string };
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `Error ${res.status}`);
      onResult({
        origin: "ai",
        estimate: body.estimate,
        sources: body.sources,
        research: body.research,
        drafts: body.estimate.items.map((it) => ({
          key: newId(),
          name: it.name,
          portion: it.portion,
          nutrients: it.nutrients,
          basis: it.basis,
          include: true,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimate failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="photo-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt="Meal photo" />
        ) : (
          <>
            <div style={{ fontSize: 34 }}>📷</div>
            <div>Take or choose a photo of your meal</div>
            <div className="small">Optional if you describe it below</div>
          </>
        )}
      </div>
      {photo && (
        <button className="ghost small" onClick={() => setPhoto(null)}>Remove photo</button>
      )}

      <label className="field">
        <span>Where did you eat it? (restaurant, stall, brand)</span>
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Super Simple, Raffles Place" list="places" />
        <datalist id="places">
          {PLACE_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
        </datalist>
      </label>
      <label className="field">
        <span>What was it? Any details help</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Hunter's Bowl, dressing on the side, half the rice. Plus a kopi siew dai."
        />
      </label>
      <label className="row small" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={lookup} onChange={(e) => setLookup(e.target.checked)} style={{ width: "auto" }} />
        <span>Look up published nutrition facts online (slower, more accurate for chains)</span>
      </label>

      {error && <div className="error">{error}</div>}
      <button className="primary block" disabled={busy || (!photo && !description.trim())} onClick={estimate}>
        {busy ? (
          <>
            <span className="spinner" /> {lookup ? "Looking up & estimating…" : "Estimating…"}
          </>
        ) : (
          "Estimate nutrients"
        )}
      </button>
    </section>
  );
}

function SearchPanel({ onPick }: { onPick: (r: Review) => void }) {
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
      const param = /^\d{8,14}$/.test(term) ? `barcode=${term}` : `q=${encodeURIComponent(term)}`;
      const res = await fetch(`/api/foods?${param}`);
      const body = (await res.json()) as { results?: FoodResult[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      setResults(body.results ?? []);
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
                drafts: [
                  {
                    key: newId(),
                    name: picked.brand ? `${picked.name} (${picked.brand})` : picked.name,
                    portion: `${grams} g`,
                    nutrients: n,
                    basis: "database",
                    include: true,
                  },
                ],
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
      <p className="muted small" style={{ margin: 0 }}>
        Searches Open Food Facts, a public database of packaged foods. For restaurant meals use Photo / describe.
      </p>
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

const BASIS_LABEL: Record<string, string> = { published: "Official figures", database: "Database", visual: "Estimated from photo" };

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
  const est = review.estimate;

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>{est?.mealName ?? "Review"}</h2>
          {est && <span className={`pill ${est.confidence === "high" ? "good" : est.confidence === "low" ? "warn" : ""}`}>{est.confidence} confidence</span>}
        </div>
        <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: 6 }} className="num">
          {Math.round(total.calories)} <span className="muted small">kcal</span>
        </div>
        <div className="small muted num">
          Protein {total.proteinG.toFixed(0)} g · Carbs {total.carbsG.toFixed(0)} g · Fat {total.fatG.toFixed(0)} g · Fibre {total.fiberG.toFixed(0)} g
        </div>
        {est?.notes && <p className="small" style={{ marginBottom: 0 }}>{est.notes}</p>}
        {est?.lighterSwap && <p className="small notice" style={{ marginBottom: 0 }}>💡 Lighter next time: {est.lighterSwap}</p>}
        {review.sources.length > 0 && (
          <details style={{ marginTop: 8 }} open>
            <summary>Sources</summary>
            <ol className="sources">
              {review.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
              ))}
            </ol>
          </details>
        )}
        {review.research && (
          <details style={{ marginTop: 6 }}>
            <summary>What the lookup found</summary>
            <p className="small" style={{ whiteSpace: "pre-wrap" }}>{review.research}</p>
          </details>
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
              {d.basis && <span className="pill">{BASIS_LABEL[d.basis] ?? d.basis}</span>}
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
        <button
          onClick={() =>
            setReview({
              ...review,
              drafts: [...review.drafts, { key: newId(), name: "", portion: "1 serving", nutrients: { ...EMPTY_NUTRIENTS }, include: true }],
            })
          }
        >
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
