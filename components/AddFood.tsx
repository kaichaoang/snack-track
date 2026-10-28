"use client";

import { useRef, useState } from "react";
import { EMPTY_NUTRIENTS, scaleNutrients, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { defaultMealSlot, MEAL_SLOTS, newId, type FoodEntry, type MealSlot, type Source } from "@/lib/store";
import { claudePrompt, claudeUrl, estimateMeal, parseClaudeReply, type AiEstimate, type AiItem, type Feedback } from "@/lib/ai";
import { FeedbackView } from "./FeedbackView";
import { useAiEnabled, useSession } from "@/lib/sync";
import { resizeImage } from "@/lib/image";
import { describeMeal } from "@/lib/describe";

interface Draft {
  key: string;
  name: string;
  portion: string;
  nutrients: Nutrients;
  include: boolean;
  /** Meal this part belongs to (from the AI). */
  meal?: MealSlot;
  /** Dish this part belongs to; each dish is logged as its own entry. */
  dish?: string;
}

interface Review {
  origin: FoodEntry["origin"];
  drafts: Draft[];
  sources: Source[];
  /** Log all included items as one entry with this name (described meals). */
  combineAs?: string;
  notes?: string;
  feedback?: Feedback;
  mealFeedback?: Partial<Record<MealSlot, Feedback>>;
}

// The quick (non-AI) estimate uses typical values; nudge it up so it errs high.
const QUICK_ESTIMATE_BUFFER = 1.15;

const draft = (name: string, portion: string, nutrients: Nutrients, meal?: MealSlot, dish?: string): Draft => ({
  key: newId(),
  name,
  portion,
  nutrients: { ...nutrients },
  include: true,
  meal,
  dish,
});

const cap = (m: string) => m[0].toUpperCase() + m.slice(1);

function MealFeedbackList({ byMeal }: { byMeal: Partial<Record<MealSlot, Feedback>> }) {
  return (
    <>
      {MEAL_SLOTS.filter((m) => byMeal[m]).map((m) => (
        <div key={m} style={{ marginTop: 8 }}>
          <b className="small">{cap(m)}</b>
          <FeedbackView feedback={byMeal[m]!} />
        </div>
      ))}
    </>
  );
}

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
  const [meal, setMeal] = useState<MealSlot>(defaultMealSlot());
  const [review, setReview] = useState<Review | null>(null);
  const [multiplier, setMultiplier] = useState(1);

  function save() {
    if (!review) return;
    const now = Date.now();
    const included = review.drafts.filter((d) => d.include);
    if (included.length === 0) return;
    if (review.combineAs) {
      // One entry per dish, under its meal: "fish soup with less rice, then Yole"
      // becomes two entries. Parts without a dish are grouped per meal.
      const groups = new Map<string, { slot: MealSlot; dish?: string; parts: Draft[] }>();
      for (const d of included) {
        const slot = d.meal ?? meal;
        const k = `${slot}|${d.dish ?? ""}`;
        if (!groups.has(k)) groups.set(k, { slot, dish: d.dish, parts: [] });
        groups.get(k)!.parts.push(d);
      }
      const ordered = [...groups.values()].sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
      const feedbackGiven = new Set<MealSlot>();
      onSave(
        ordered.map((g, i) => {
          const names = g.parts.map((d) => d.name.split(" (")[0]).join(", ");
          // Feedback goes on the first entry of each meal so it isn't repeated.
          const fb = feedbackGiven.has(g.slot)
            ? undefined
            : review.mealFeedback?.[g.slot] ?? (new Set(ordered.map((x) => x.slot)).size === 1 ? review.feedback : undefined);
          feedbackGiven.add(g.slot);
          return {
            id: newId(),
            date,
            createdAt: now + i,
            meal: g.slot,
            name: g.dish ?? (ordered.length === 1 ? review.combineAs! : names),
            portion: (multiplier === 1 ? "" : `×${multiplier} · `) + names,
            nutrients: scaleNutrients(sumNutrients(g.parts.map((d) => d.nutrients)), multiplier),
            origin: review.origin,
            sources: review.sources.length ? review.sources : undefined,
            feedback: fb,
          };
        }),
      );
      return;
    }
    onSave(
      included.map((d, i) => ({
        id: newId(),
        date,
        createdAt: now + i,
        meal,
        name: d.name || "Food",
        portion: multiplier === 1 ? d.portion : `${d.portion} ×${multiplier}`,
        nutrients: scaleNutrients(d.nutrients, multiplier),
        origin: review.origin,
        sources: review.sources.length ? review.sources : undefined,
      })),
    );
  }

  function relog(e: FoodEntry) {
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
          <DescribePanel onUse={setReview} />
          <button
            className="block"
            style={{ marginBottom: 12 }}
            onClick={() => setReview({ origin: "manual", sources: [], drafts: [draft("", "1 serving", EMPTY_NUTRIENTS)] })}
          >
            ✏️ Log manually
          </button>
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
    const k = `${e.name}|${e.portion}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push(e);
    if (recent.length === 6) break;
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
          <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {e.portion}
          </div>
        </button>
      ))}
    </section>
  );
}

/** Copy a ready-made prompt into Claude, then paste Claude's answer back. */
function AskClaude({ text, onUse }: { text: string; onUse: (r: Review) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prompt = claudePrompt(text);

  function copy() {
    // Fire-and-forget: the link opens Claude in the same tap.
    navigator.clipboard?.writeText(prompt).then(() => setCopied(true), () => setCopied(false));
    setOpen(true);
  }

  async function pasteFromClipboard() {
    try {
      setReply(await navigator.clipboard.readText());
    } catch {
      setError("Couldn't read the clipboard. Long-press the box below and choose Paste.");
    }
  }

  function useReply() {
    try {
      const e = parseClaudeReply(reply);
      onUse({
        origin: "ai",
        sources: [],
        notes: e.notes,
        feedback: e.feedback,
        mealFeedback: e.mealFeedback,
        combineAs: text.trim() || e.mealName,
        drafts: e.items.map((i) => draft(i.name, i.portion, i.nutrients, i.meal, i.dish)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that reply.");
    }
  }

  return (
    <div className="ask-claude stack">
      <a className="button block" href={claudeUrl(prompt)} target="_blank" rel="noreferrer" onClick={copy}>
        Ask Claude ↗
      </a>
      {open && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {copied ? "The question is copied. " : ""}If Claude opens without it, paste it in. When Claude answers, copy its
            whole reply and paste it here.
          </p>
          <textarea
            rows={4}
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setError(null);
            }}
            placeholder="Paste Claude's reply"
          />
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="grow" onClick={pasteFromClipboard}>Paste</button>
            <button className="primary grow" disabled={!reply.trim()} onClick={useReply}>Use Claude&apos;s numbers</button>
          </div>
          <button className="ghost small" onClick={() => navigator.clipboard?.writeText(prompt).then(() => setCopied(true))}>
            Copy the question again
          </button>
        </>
      )}
    </div>
  );
}

const BASIS_LABEL: Record<AiItem["basis"], string> = { published: "Official figures", database: "Standard figures", estimate: "Estimate" };

function DescribePanel({ onUse }: { onUse: (r: Review) => void }) {
  const [session] = useSession();
  const aiEnabled = useAiEnabled();
  const canUseAi = !!session && aiEnabled;
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ data: string; mediaType: string; previewUrl: string } | null>(null);
  const [ai, setAi] = useState<AiEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick estimate: used when AI isn't available on this account, or as a fallback.
  const quick = describeMeal(text).items.map((i) => ({ ...i, nutrients: scaleNutrients(i.nutrients, QUICK_ESTIMATE_BUFFER) }));
  const name = text.trim() || ai?.mealName || "Meal";
  const showQuick = !canUseAi || (!!error && quick.length > 0);

  async function askAi() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setAi(await estimateMeal(session.token, text, photo ? { data: photo.data, mimeType: photo.mediaType } : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't estimate that. Try again, or log manually.");
    } finally {
      setBusy(false);
    }
  }

  function useAi() {
    if (!ai) return;
    onUse({
      origin: "ai",
      sources: ai.sources,
      notes: ai.notes,
      feedback: ai.feedback,
      mealFeedback: ai.mealFeedback,
      combineAs: name,
      drafts: ai.items.map((i) => draft(i.name, i.portion, i.nutrients, i.meal, i.dish)),
    });
  }

  function useQuick() {
    onUse({ origin: "described", sources: [], combineAs: name, drafts: quick.map((i) => draft(i.name, i.amount, i.nutrients)) });
  }

  const total = sumNutrients(ai ? ai.items.map((i) => i.nutrients) : quick.map((i) => i.nutrients));

  return (
    <section className="card stack">
      <label className="field">
        <span>What did you eat?</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAi(null);
            setError(null);
          }}
          placeholder="e.g. grouper fish soup with less rice, a little sauce, some soup"
          className="describe"
          rows={5}
        />
      </label>

      {canUseAi && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setPhoto(await resizeImage(f));
                setAi(null);
              } catch {
                setError("Couldn't read that photo.");
              }
            }}
          />
          {photo ? (
            <div className="row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="Meal" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
              <span className="grow small muted">Photo added</span>
              <button className="ghost" onClick={() => { setPhoto(null); setAi(null); }}>Remove</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}>📷 Add a photo (optional)</button>
          )}
          {!ai && (
            <button className="primary block" disabled={busy || (!text.trim() && !photo)} onClick={askAi}>
              {busy ? (
                <>
                  <span className="spinner" /> Estimating…
                </>
              ) : (
                "✨ Estimate"
              )}
            </button>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}

      {ai && (
        <div>
          <div className="row between">
            <b>{ai.mealName}</b>
            <span className={`pill ${ai.confidence === "high" ? "good" : ai.confidence === "low" ? "warn" : ""}`}>{ai.confidence} confidence</span>
          </div>
          {ai.items.map((i, n) => (
            <div className="entry" key={n}>
              <div className="grow">
                <div className="name">{i.name}</div>
                <div className="meta">{[i.meal && cap(i.meal), i.dish, i.portion, BASIS_LABEL[i.basis]].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="kcal">{Math.round(i.nutrients.calories)}</span>
            </div>
          ))}
          {ai.notes && <p className="small" style={{ margin: "6px 0 0" }}>{ai.notes}</p>}
          {ai.feedback && <FeedbackView feedback={ai.feedback} />}
          {ai.mealFeedback && <MealFeedbackList byMeal={ai.mealFeedback} />}
          {ai.sources.length > 0 && (
            <ol className="sources">
              {ai.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!ai && showQuick && quick.length > 0 && (
        <div>
          {quick.map((i) => (
            <div className="entry" key={i.id}>
              <div className="grow">
                <div className="name">{i.name}</div>
                <div className="meta">{i.amount}</div>
              </div>
              <span className="kcal">{Math.round(i.nutrients.calories)}</span>
            </div>
          ))}
        </div>
      )}

      {(ai || (showQuick && quick.length > 0)) && (
        <div>
          <div className="row between" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <b>Total</b>
            <b className="num">{Math.round(total.calories)} kcal</b>
          </div>
          <div className="small muted num">
            P {Math.round(total.proteinG)} g · C {Math.round(total.carbsG)} g · F {Math.round(total.fatG)} g
          </div>
        </div>
      )}

      {ai && (
        <div className="row">
          <button className="grow" disabled={busy} onClick={askAi}>{busy ? <span className="spinner" /> : "Try again"}</button>
          <button className="primary grow" onClick={useAi}>Review &amp; log</button>
        </div>
      )}
      {!ai && showQuick && (
        <button className={canUseAi ? "block" : "primary block"} disabled={quick.length === 0} onClick={useQuick}>
          {canUseAi ? "Use quick estimate instead" : "Review & log"}
        </button>
      )}

      {text.trim() && <AskClaude text={text} onUse={onUse} />}
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
  onBack,
  onSave,
}: {
  review: Review;
  setReview: (r: Review) => void;
  multiplier: number;
  setMultiplier: (n: number) => void;
  meal: MealSlot;
  setMeal: (m: MealSlot) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const updateDraft = (key: string, patch: Partial<Draft>) =>
    setReview({ ...review, drafts: review.drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)) });
  const total = scaleNutrients(sumNutrients(review.drafts.filter((d) => d.include).map((d) => d.nutrients)), multiplier);
  const manual = review.origin === "manual";
  // Each item picks its own meal when the description covered several meals.
  const multiMeal = review.drafts.some((d) => d.meal || d.dish);
  const entryCount = new Set(review.drafts.filter((d) => d.include).map((d) => `${d.meal ?? meal}|${d.dish ?? ""}`)).size;

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
        {review.notes && <p className="small" style={{ margin: "6px 0 0" }}>{review.notes}</p>}
        {review.feedback && <FeedbackView feedback={review.feedback} />}
        {review.mealFeedback && <MealFeedbackList byMeal={review.mealFeedback} />}
        {review.sources.length > 0 && (
          <ol className="sources">
            {review.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>
            ))}
          </ol>
        )}
      </section>

      <section className="card stack">
        {!manual && (
          <>
            <label className="field">
              <span>How much did you eat?</span>
            </label>
            <div className="seg" role="group" aria-label="Portion">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => (
                <button key={m} aria-pressed={multiplier === m} onClick={() => setMultiplier(m)}>×{m}</button>
              ))}
            </div>
          </>
        )}

        {review.drafts.map((d) => (
          <div className="item-edit" key={d.key} style={{ opacity: d.include ? 1 : 0.5 }}>
            {d.dish && <div className="small muted" style={{ marginBottom: 6 }}>{d.dish}</div>}
            <div className="row">
              {review.drafts.length > 1 && (
                <input type="checkbox" checked={d.include} onChange={(e) => updateDraft(d.key, { include: e.target.checked })} style={{ width: "auto" }} aria-label="Include" />
              )}
              <input className="grow" value={d.name} placeholder="What did you eat?" onChange={(e) => updateDraft(d.key, { name: e.target.value })} />
            </div>
            <div className="row" style={{ margin: "6px 0" }}>
              <input className="grow" value={d.portion} placeholder="Portion" onChange={(e) => updateDraft(d.key, { portion: e.target.value })} aria-label="Portion" />
              {multiMeal && (
                <select style={{ width: "auto" }} value={d.meal ?? meal} onChange={(e) => updateDraft(d.key, { meal: e.target.value as MealSlot })} aria-label="Meal">
                  {MEAL_SLOTS.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                </select>
              )}
            </div>
            <div className="mini-grid">
              {NUM_FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span>{f.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={Math.round(d.nutrients[f.key] * 10) / 10 || ""}
                    placeholder="0"
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
        {multiMeal ? (
          <p className="small muted" style={{ margin: 0 }}>
            Logs {entryCount} {entryCount === 1 ? "entry" : "entries"}, one per dish, under the meal chosen on each item.
          </p>
        ) : (
        <label className="field">
          <span>Meal</span>
          <select value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)}>
            {MEAL_SLOTS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        )}
        <div className="row">
          <button className="grow" onClick={onBack}>Back</button>
          <button className="primary grow" onClick={onSave} disabled={!review.drafts.some((d) => d.include && (d.name.trim() || d.nutrients.calories > 0))}>
            Log it
          </button>
        </div>
      </section>
    </>
  );
}
