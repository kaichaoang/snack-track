"use client";

import { localDateKey, sumNutrients, type Targets } from "@/lib/nutrition";
import { MEAL_SLOTS, type FoodEntry } from "@/lib/store";

export function shiftDate(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return localDateKey(new Date(y, m - 1, d + days));
}

export function prettyDate(key: string): string {
  const today = localDateKey();
  if (key === today) return "Today";
  if (key === shiftDate(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Ring({ eaten, target }: { eaten: number; target: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = target > 0 ? Math.min(eaten / target, 1) : 0;
  const over = eaten > target;
  const remaining = Math.round(target - eaten);
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${Math.round(eaten)} of ${Math.round(target)} kcal`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke={over ? "var(--danger)" : "var(--accent)"}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="62" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">
        {Math.abs(remaining)}
      </text>
      <text x="66" y="82" textAnchor="middle" fontSize="11" fill="var(--muted)">
        {over ? "kcal over" : "kcal left"}
      </text>
    </svg>
  );
}

function MacroBar({
  label,
  value,
  goal,
  unit,
  color,
  limit,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  limit?: boolean;
}) {
  const pct = goal > 0 ? Math.min(value / goal, 1) * 100 : 0;
  const over = limit && value > goal;
  return (
    <div className="macro">
      <div className="row">
        <span>{label}</span>
        <span className="num muted">
          <b style={{ color: over ? "var(--danger)" : "var(--text)" }}>{Math.round(value)}</b> / {Math.round(goal)}
          {unit}
          {limit ? " max" : ""}
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%`, background: over ? "var(--danger)" : color }} />
      </div>
    </div>
  );
}

export function TodayView({
  date,
  setDate,
  entries,
  t,
  onDelete,
  onAdd,
}: {
  date: string;
  setDate: (d: string) => void;
  entries: FoodEntry[];
  t: Targets;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const day = entries.filter((e) => e.date === date);
  const total = sumNutrients(day.map((e) => e.nutrients));
  const isToday = date === localDateKey();

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="ghost" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          ‹ Prev
        </button>
        <b>{prettyDate(date)}</b>
        <button className="ghost" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday} aria-label="Next day">
          Next ›
        </button>
      </div>

      <section className="card">
        <div className="ring-wrap">
          <Ring eaten={total.calories} target={t.calories} />
          <div className="stats">
            <div className="stat"><span className="muted">Target</span><b>{Math.round(t.calories)}</b></div>
            <div className="stat"><span className="muted">Eaten</span><b>{Math.round(total.calories)}</b></div>
            <div className="stat"><span className="muted">Maintenance</span><b>{Math.round(t.tdee)}</b></div>
            <div className="stat">
              <span className="muted">Under maintenance</span>
              <b style={{ color: total.calories <= t.tdee ? "var(--accent)" : "var(--danger)" }}>
                {Math.round(t.tdee - total.calories)}
              </b>
            </div>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Nutrients</h2>
        <MacroBar label="Protein" value={total.proteinG} goal={t.proteinG} unit="g" color="var(--protein)" />
        <MacroBar label="Carbs" value={total.carbsG} goal={t.carbsG} unit="g" color="var(--carbs)" />
        <MacroBar label="Fat" value={total.fatG} goal={t.fatG} unit="g" color="var(--fat)" />
        <MacroBar label="Fibre" value={total.fiberG} goal={t.fiberG} unit="g" color="var(--fiber)" />
        <details>
          <summary>Limits: sugar, saturated fat, sodium</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <MacroBar label="Sugar" value={total.sugarG} goal={t.sugarMaxG} unit="g" color="var(--carbs)" limit />
            <MacroBar label="Saturated fat" value={total.saturatedFatG} goal={t.saturatedFatMaxG} unit="g" color="var(--fat)" limit />
            <MacroBar label="Sodium" value={total.sodiumMg} goal={t.sodiumMaxMg} unit="mg" color="var(--muted)" limit />
          </div>
        </details>
      </section>

      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Food log</h2>
          <button className="primary" onClick={onAdd}>+ Add food</button>
        </div>
        {day.length === 0 && <p className="muted small">Nothing logged yet. Snap a photo of your next meal.</p>}
        {MEAL_SLOTS.map((slot) => {
          const items = day.filter((e) => e.meal === slot).sort((a, b) => a.createdAt - b.createdAt);
          if (items.length === 0) return null;
          const kcal = sumNutrients(items.map((i) => i.nutrients)).calories;
          return (
            <div key={slot}>
              <h3 className="row between">
                <span>{slot}</span>
                <span className="num">{Math.round(kcal)} kcal</span>
              </h3>
              {items.map((e) => (
                <div className="entry" key={e.id}>
                  <div className="grow">
                    <div className="name">{e.name}</div>
                    <div className="meta">
                      {e.portion}
                      {e.place ? ` · ${e.place}` : ""} · P {Math.round(e.nutrients.proteinG)} · C {Math.round(e.nutrients.carbsG)} · F{" "}
                      {Math.round(e.nutrients.fatG)}
                    </div>
                  </div>
                  <span className="kcal">{Math.round(e.nutrients.calories)}</span>
                  <button className="ghost danger" aria-label={`Delete ${e.name}`} onClick={() => onDelete(e.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </>
  );
}
