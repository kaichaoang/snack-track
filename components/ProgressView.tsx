"use client";

import { useState } from "react";
import { KCAL_PER_KG_FAT, localDateKey, sumNutrients, weightTrend, type Nutrients, type Profile, type Targets } from "@/lib/nutrition";
import type { FoodEntry, WeightEntry } from "@/lib/store";
import { fullDate, prettyDate, shiftDate } from "./TodayView";
import { IconButton } from "./Icons";

function WeightChart({ weights, goal }: { weights: WeightEntry[]; goal: number }) {
  const data = weightTrend([...weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-60));
  if (data.length < 2) return <p className="muted small">Log your weight on a few days to see the trend.</p>;
  const W = 320, H = 150, pad = { l: 30, r: 8, t: 8, b: 18 };
  const values = [...data.map((d) => d.kg), goal];
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (kg: number) => pad.t + ((max - kg) / (max - min)) * (H - pad.t - pad.b);
  const trendPath = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.trend).toFixed(1)}`).join(" ");
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight trend chart">
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={pad.l - 4} y={y(v) + 3} textAnchor="end">{v.toFixed(0)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--accent)" strokeDasharray="4 4" />
        <text x={W - pad.r} y={y(goal) - 4} textAnchor="end">goal {goal}</text>
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.kg)} r="2.5" fill="var(--muted)" opacity="0.6" />
        ))}
        <path d={trendPath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        <text x={pad.l} y={H - 4}>{fullDate(data[0].date)}</text>
        <text x={W - pad.r} y={H - 4} textAnchor="end">{fullDate(data[data.length - 1].date)}</text>
      </svg>
    </div>
  );
}

function CalorieBars({ days, target, tdee }: { days: { date: string; kcal: number; logged: boolean }[]; target: number; tdee: number }) {
  const W = 320, H = 140, pad = { l: 30, r: 8, t: 8, b: 18 };
  const max = Math.max(tdee, ...days.map((d) => d.kcal)) * 1.1;
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily calories vs target">
        {days.map((d, i) => (
          <g key={d.date}>
            <rect
              x={pad.l + i * bw + bw * 0.15}
              width={bw * 0.7}
              y={y(d.kcal)}
              height={Math.max(0, H - pad.b - y(d.kcal))}
              rx="3"
              fill={!d.logged ? "var(--surface-2)" : d.kcal > tdee ? "var(--danger)" : d.kcal > target ? "var(--warn)" : "var(--accent)"}
            />
            <text x={pad.l + i * bw + bw / 2} y={H - 4} textAnchor="middle">
              {new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--accent)" strokeDasharray="4 4" />
        <text x={pad.l - 4} y={y(target) + 3} textAnchor="end">{Math.round(target)}</text>
        <line x1={pad.l} x2={W - pad.r} y1={y(tdee)} y2={y(tdee)} stroke="var(--muted)" strokeDasharray="2 4" />
        <text x={pad.l - 4} y={y(tdee) + 3} textAnchor="end">{Math.round(tdee)}</text>
      </svg>
      <div className="small muted">Dashed green: target. Dotted grey: maintenance. Amber: over target but still in deficit. Red: above maintenance.</div>
    </div>
  );
}

type MetricKey = Exclude<keyof Nutrients, "calories">;

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  /** "goal": aim to reach it (protein, fibre). "limit": stay under it. "target": aim near it. */
  kind: "goal" | "limit" | "target";
  line: (t: Targets) => number;
}

const METRICS: Metric[] = [
  { key: "sodiumMg", label: "Sodium", unit: "mg", kind: "limit", line: (t) => t.sodiumMaxMg },
  { key: "sugarG", label: "Sugar", unit: "g", kind: "limit", line: (t) => t.sugarMaxG },
  { key: "saturatedFatG", label: "Sat fat", unit: "g", kind: "limit", line: (t) => t.saturatedFatMaxG },
  { key: "proteinG", label: "Protein", unit: "g", kind: "goal", line: (t) => t.proteinG },
  { key: "fiberG", label: "Fibre", unit: "g", kind: "goal", line: (t) => t.fiberG },
  { key: "carbsG", label: "Carbs", unit: "g", kind: "target", line: (t) => t.carbsG },
  { key: "fatG", label: "Fat", unit: "g", kind: "target", line: (t) => t.fatG },
];

function barColor(kind: Metric["kind"], value: number, line: number): string {
  if (kind === "limit") return value > line ? "var(--danger)" : value > line * 0.85 ? "var(--warn)" : "var(--accent)";
  if (kind === "goal") return value >= line ? "var(--accent)" : value >= line * 0.7 ? "var(--warn)" : "var(--muted)";
  return value > line * 1.2 ? "var(--warn)" : "var(--accent)";
}

/** Daily bars for one nutrient against its goal or limit line. */
function NutrientBars({ days, metric, line }: { days: { date: string; logged: boolean; n: Nutrients }[]; metric: Metric; line: number }) {
  const W = 320, H = 140, pad = { l: 34, r: 8, t: 8, b: 18 };
  const max = Math.max(line, ...days.map((d) => d.n[metric.key])) * 1.1 || 1;
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily ${metric.label.toLowerCase()}`}>
        {days.map((d, i) => {
          const v = d.n[metric.key];
          return (
            <g key={d.date}>
              <rect
                x={pad.l + i * bw + bw * 0.15}
                width={bw * 0.7}
                y={y(v)}
                height={Math.max(0, H - pad.b - y(v))}
                rx="3"
                fill={d.logged ? barColor(metric.kind, v, line) : "var(--surface-2)"}
              />
              <text x={pad.l + i * bw + bw / 2} y={H - 4} textAnchor="middle">
                {new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(line)} y2={y(line)} stroke={metric.kind === "limit" ? "var(--danger)" : "var(--accent)"} strokeDasharray="4 4" />
        <text x={pad.l - 4} y={y(line) + 3} textAnchor="end">{Math.round(line)}</text>
      </svg>
    </div>
  );
}

function NutrientStats({ t, entries, today }: { t: Targets; entries: FoodEntry[]; today: string }) {
  const [key, setKey] = useState<MetricKey>("sodiumMg");
  const metric = METRICS.find((m) => m.key === key)!;
  const line = metric.line(t);
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = shiftDate(today, i - 13);
    const items = entries.filter((e) => e.date === date);
    return { date, logged: items.length > 0, n: sumNutrients(items.map((e) => e.nutrients)) };
  });
  // Today is incomplete, so it's left out of the averages.
  const done = days.filter((d) => d.logged && d.date !== today);
  const avg = done.length ? done.reduce((s, d) => s + d.n[key], 0) / done.length : null;
  const hits = done.filter((d) => (metric.kind === "limit" ? d.n[key] > line : d.n[key] >= line)).length;
  const fmt = (v: number) => `${Math.round(v).toLocaleString()} ${metric.unit}`;

  return (
    <section className="card stack">
      <h2>Nutrients · last 14 days</h2>
      <div className="chips" role="group" aria-label="Nutrient">
        {METRICS.map((m) => (
          <button key={m.key} aria-pressed={m.key === key} onClick={() => setKey(m.key)}>{m.label}</button>
        ))}
      </div>
      <NutrientBars days={days} metric={metric} line={line} />
      <div className="grid2 small">
        <div>
          <div className="muted">Daily average</div>
          <b className="num" style={{ color: avg !== null && metric.kind === "limit" && avg > line ? "var(--danger)" : undefined }}>
            {avg !== null ? fmt(avg) : "—"}
          </b>
        </div>
        <div>
          <div className="muted">{metric.kind === "limit" ? "Daily limit" : metric.kind === "goal" ? "Daily goal" : "Daily target"}</div>
          <b className="num">{fmt(line)}</b>
        </div>
        <div>
          <div className="muted">{metric.kind === "limit" ? "Days over the limit" : "Days reaching it"}</div>
          <b className="num">{done.length ? `${hits} of ${done.length}` : "—"}</b>
        </div>
      </div>
      <div className="small muted">
        {metric.kind === "limit"
          ? "Dashed red: the most to have in a day. Red bars went over it."
          : "Dashed green: your daily amount. Green bars reached it."}
      </div>
    </section>
  );
}

export function ProgressView({
  profile,
  t,
  entries,
  weights,
  onLogWeight,
  onDeleteWeight,
}: {
  profile: Profile;
  t: Targets;
  entries: FoodEntry[];
  weights: WeightEntry[];
  onLogWeight: (w: WeightEntry) => void;
  onDeleteWeight: (date: string) => void;
}) {
  const today = localDateKey();
  const [kg, setKg] = useState<string>("");

  const days = Array.from({ length: 14 }, (_, i) => {
    const date = shiftDate(today, i - 13);
    const items = entries.filter((e) => e.date === date);
    return { date, kcal: sumNutrients(items.map((e) => e.nutrients)).calories, logged: items.length > 0 };
  });
  // Today is incomplete, so it's excluded from averages.
  const logged = days.filter((d) => d.logged && d.date !== today);
  const avgIntake = logged.length ? logged.reduce((s, d) => s + d.kcal, 0) / logged.length : null;
  const avgDeficit = avgIntake !== null ? t.tdee - avgIntake : null;
  const estLossKg = logged.reduce((s, d) => s + (t.tdee - d.kcal), 0) / KCAL_PER_KG_FAT;

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const trend = weightTrend(sorted).at(-1)?.trend ?? profile.weightKg;
  const toGo = trend - profile.goalWeightKg;
  const projectedWeeks = avgDeficit && avgDeficit > 0 && toGo > 0 ? (toGo * KCAL_PER_KG_FAT) / (avgDeficit * 7) : null;
  const projectedDate =
    projectedWeeks !== null
      ? new Date(Date.now() + projectedWeeks * 7 * 864e5).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      : null;

  return (
    <>
      <section className="card stack">
        <h2>Weight</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseFloat(kg);
            if (v > 0) {
              onLogWeight({ date: today, kg: v });
              setKg("");
            }
          }}
        >
          <input className="grow" type="number" inputMode="decimal" step="0.1" placeholder={latest ? `Last: ${latest.kg} kg` : "Today's weight (kg)"} value={kg} onChange={(e) => setKg(e.target.value)} />
          <button className="primary">Log</button>
        </form>
        <WeightChart weights={weights} goal={profile.goalWeightKg} />
        <div className="grid2 small">
          <div><div className="muted">Trend weight</div><b className="num">{trend.toFixed(1)} kg</b></div>
          <div><div className="muted">To go</div><b className="num">{Math.max(0, toGo).toFixed(1)} kg</b></div>
        </div>
        {sorted.length > 0 && (
          <details>
            <summary>Weigh-ins ({sorted.length})</summary>
            {sorted.slice().reverse().slice(0, 30).map((w) => (
              <div className="entry" key={w.date}>
                <span className="grow">{prettyDate(w.date)}</span>
                <span className="kcal">{w.kg} kg</span>
                <IconButton
                  icon="trash"
                  danger
                  label={`Delete weigh-in on ${prettyDate(w.date)}`}
                  onClick={() => {
                    if (window.confirm(`Delete the weigh-in on ${prettyDate(w.date)}?`)) onDeleteWeight(w.date);
                  }}
                />
              </div>
            ))}
          </details>
        )}
      </section>

      <section className="card stack">
        <h2>Calories · last 14 days</h2>
        <CalorieBars days={days} target={t.calories} tdee={t.tdee} />
        <div className="grid2 small">
          <div><div className="muted">Avg intake (logged days)</div><b className="num">{avgIntake !== null ? `${Math.round(avgIntake)} kcal` : "—"}</b></div>
          <div><div className="muted">Avg daily deficit</div><b className="num" style={{ color: (avgDeficit ?? 0) >= 0 ? "var(--accent)" : "var(--danger)" }}>{avgDeficit !== null ? `${Math.round(avgDeficit)} kcal` : "—"}</b></div>
          <div><div className="muted">Est. fat lost (from logs)</div><b className="num">{logged.length ? `${estLossKg.toFixed(2)} kg` : "—"}</b></div>
          <div><div className="muted">Projected goal date</div><b>{projectedDate ?? "—"}</b></div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Estimates assume your maintenance is {Math.round(t.tdee)} kcal. If your trend weight drops slower than predicted over
          3–4 weeks, you are likely under-logging or maintenance is lower; trim the target by ~100–200 kcal.
        </p>
      </section>

      <NutrientStats t={t} entries={entries} today={today} />
    </>
  );
}
