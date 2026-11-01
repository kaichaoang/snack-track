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

interface CalBar {
  key: string;
  label: string;
  kcal: number;
  /** Net kcal per logged day, used for the colour so gaps don't make a week look good. */
  perDay: number;
  logged: boolean;
  /** Week with days missing (or still in progress): drawn lighter. */
  partial?: boolean;
}

function CalorieBars({ bars, target, tdee, scale = 1 }: { bars: CalBar[]; target: number; tdee: number; scale?: number }) {
  const W = 320, H = 140, pad = { l: 34, r: 8, t: 8, b: 18 };
  const max = Math.max(tdee * scale, ...bars.map((d) => d.kcal)) * 1.1;
  const bw = (W - pad.l - pad.r) / bars.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={scale > 1 ? "Weekly calories vs budget" : "Daily calories vs target"}>
        {bars.map((d, i) => (
          <g key={d.key}>
            <rect
              x={pad.l + i * bw + bw * 0.15}
              width={bw * 0.7}
              y={y(d.kcal)}
              height={Math.max(0, H - pad.b - y(d.kcal))}
              rx="3"
              opacity={d.partial ? 0.5 : 1}
              fill={!d.logged ? "var(--surface-2)" : d.perDay > tdee ? "var(--danger)" : d.perDay > target ? "var(--warn)" : "var(--accent)"}
            />
            <text x={pad.l + i * bw + bw / 2} y={H - 4} textAnchor="middle">{d.label}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(target * scale)} y2={y(target * scale)} stroke="var(--accent)" strokeDasharray="4 4" />
        <text x={pad.l - 4} y={y(target * scale) + 3} textAnchor="end">{kShort(target * scale)}</text>
        <line x1={pad.l} x2={W - pad.r} y1={y(tdee * scale)} y2={y(tdee * scale)} stroke="var(--muted)" strokeDasharray="2 4" />
        <text x={pad.l - 4} y={y(tdee * scale) + 3} textAnchor="end">{kShort(tdee * scale)}</text>
      </svg>
      <div className="small muted">
        {scale > 1
          ? "Dashed green: weekly budget. Dotted grey: weekly maintenance. Colour is from the daily average on logged days. Faded: days missing or week in progress."
          : "Dashed green: target. Dotted grey: maintenance. Amber: over target but still in deficit. Red: above maintenance."}
      </div>
    </div>
  );
}

/** 1234 → "1234", 10850 → "10.9k" so weekly axis labels fit. */
function kShort(v: number): string {
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

const narrowDay = (date: string) => new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "narrow" });
const dayMonth = (date: string) => new Date(date + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "numeric" });

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return shiftDate(date, -((new Date(date + "T00:00").getDay() + 6) % 7));
}

interface DayData {
  date: string;
  /** Food eaten. */
  n: Nutrients;
  burned: number;
  /** Any food logged that day. */
  logged: boolean;
}

function dayData(entries: FoodEntry[], date: string): DayData {
  const items = entries.filter((e) => e.date === date);
  const food = items.filter((e) => e.kind !== "exercise");
  return {
    date,
    n: sumNutrients(food.map((e) => e.nutrients)),
    burned: items.filter((e) => e.kind === "exercise").reduce((s, e) => s + e.nutrients.calories, 0),
    logged: food.length > 0,
  };
}

const netOf = (d: DayData) => Math.max(0, d.n.calories - d.burned);

/** The 7 days of the week starting `start`, up to today. */
function weekDays(entries: FoodEntry[], start: string, today: string): DayData[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
    .filter((d) => d <= today)
    .map((d) => dayData(entries, d));
}

type View = "day" | "week";

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="seg" role="group" aria-label="Daily or weekly">
      <button aria-pressed={view === "day"} onClick={() => setView("day")}>Daily</button>
      <button aria-pressed={view === "week"} onClick={() => setView("week")}>Weekly</button>
    </div>
  );
}

/** Totals for one Monday–Sunday week against the weekly budget. */
function WeekCard({ t, entries, today }: { t: Targets; entries: FoodEntry[]; today: string }) {
  const current = weekStart(today);
  const [start, setStart] = useState(current);
  const days = weekDays(entries, start, today);
  const eaten = days.reduce((s, d) => s + d.n.calories, 0);
  const burned = days.reduce((s, d) => s + d.burned, 0);
  const net = eaten - burned;
  const budget = t.calories * 7;
  const left = budget - net;
  const logged = days.filter((d) => d.logged);
  const avg = logged.length ? logged.reduce((s, d) => s + netOf(d), 0) / logged.length : null;
  const isCurrent = start === current;
  const fmt = (v: number) => `${Math.round(v).toLocaleString()} kcal`;

  return (
    <section className="card stack">
      <div className="row between">
        <button className="ghost" aria-label="Previous week" onClick={() => setStart(shiftDate(start, -7))}>‹</button>
        <h2 style={{ margin: 0, textAlign: "center" }}>
          {isCurrent ? "This week" : "Week"} · {fullDate(start).replace(/^\w+, /, "")} – {fullDate(shiftDate(start, 6)).replace(/^\w+, /, "")}
        </h2>
        <button className="ghost" aria-label="Next week" disabled={isCurrent} onClick={() => setStart(shiftDate(start, 7))}>›</button>
      </div>
      <div className="grid2 small">
        <div><div className="muted">Eaten</div><b className="num">{fmt(eaten)}</b></div>
        <div><div className="muted">Exercise</div><b className="num" style={{ color: "var(--accent)" }}>−{fmt(burned)}</b></div>
        <div><div className="muted">Net</div><b className="num">{fmt(net)}</b></div>
        <div><div className="muted">Weekly budget</div><b className="num">{fmt(budget)}</b></div>
        <div>
          <div className="muted">{left >= 0 ? (isCurrent ? "Left this week" : "Under budget") : "Over budget"}</div>
          <b className="num" style={{ color: left >= 0 ? "var(--accent)" : "var(--danger)" }}>{fmt(Math.abs(left))}</b>
        </div>
        <div><div className="muted">Avg net per logged day</div><b className="num">{avg !== null ? fmt(avg) : "—"}</b></div>
      </div>
      <div className="small muted">
        {logged.length} of {isCurrent ? `${days.length} day${days.length === 1 ? "" : "s"} so far` : "7 days"} logged.
        {isCurrent && left > 0 && days.length < 7 && ` That leaves about ${Math.round(left / (7 - days.length + 1)).toLocaleString()} kcal a day for the rest of the week, including today.`}
      </div>
    </section>
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
function NutrientBars({ days, metric, line }: { days: { date: string; label: string; logged: boolean; partial?: boolean; n: Nutrients }[]; metric: Metric; line: number }) {
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
                opacity={d.partial ? 0.5 : 1}
                fill={d.logged ? barColor(metric.kind, v, line) : "var(--surface-2)"}
              />
              <text x={pad.l + i * bw + bw / 2} y={H - 4} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(line)} y2={y(line)} stroke={metric.kind === "limit" ? "var(--danger)" : "var(--accent)"} strokeDasharray="4 4" />
        <text x={pad.l - 4} y={y(line) + 3} textAnchor="end">{Math.round(line)}</text>
      </svg>
    </div>
  );
}

function NutrientStats({ t, entries, today, view, setView }: { t: Targets; entries: FoodEntry[]; today: string; view: View; setView: (v: View) => void }) {
  const [key, setKey] = useState<MetricKey>("sodiumMg");
  const metric = METRICS.find((m) => m.key === key)!;
  const line = metric.line(t);
  // Daily: one bar per day. Weekly: one bar per week, the daily average over its logged days.
  const days =
    view === "day"
      ? Array.from({ length: 14 }, (_, i) => {
          const d = dayData(entries, shiftDate(today, i - 13));
          return { ...d, label: narrowDay(d.date), done: d.logged && d.date !== today };
        })
      : Array.from({ length: 8 }, (_, i) => {
          const start = shiftDate(weekStart(today), (i - 7) * 7);
          const logged = weekDays(entries, start, today).filter((d) => d.logged);
          const n = sumNutrients(logged.map((d) => d.n));
          const avgN = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, logged.length ? v / logged.length : 0])) as unknown as Nutrients;
          return { date: start, label: dayMonth(start), n: avgN, logged: logged.length > 0, partial: logged.length < 7, done: logged.length > 0 };
        });
  // Today is incomplete, so it's left out of the daily averages.
  const done = days.filter((d) => d.done);
  const avg = done.length ? done.reduce((s, d) => s + d.n[key], 0) / done.length : null;
  const hits = done.filter((d) => (metric.kind === "limit" ? d.n[key] > line : d.n[key] >= line)).length;
  const fmt = (v: number) => `${Math.round(v).toLocaleString()} ${metric.unit}`;
  const unit = view === "day" ? "Days" : "Weeks";

  return (
    <section className="card stack">
      <h2>Nutrients · {view === "day" ? "last 14 days" : "last 8 weeks"}</h2>
      <ViewToggle view={view} setView={setView} />
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
          <div className="muted">{metric.kind === "limit" ? `${unit} over the limit` : `${unit} reaching it`}</div>
          <b className="num">{done.length ? `${hits} of ${done.length}` : "—"}</b>
        </div>
      </div>
      <div className="small muted">
        {metric.kind === "limit"
          ? "Dashed red: the most to have in a day. Red bars went over it."
          : "Dashed green: your daily amount. Green bars reached it."}
        {view === "week" && " Each bar is the daily average over that week's logged days."}
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

  const [view, setView] = useState<View>("day");

  // Net calories: food eaten minus exercise burned.
  const span = view === "day" ? 14 : 56;
  const recent = Array.from({ length: span }, (_, i) => dayData(entries, shiftDate(today, i - span + 1)));
  const bars: CalBar[] =
    view === "day"
      ? recent.slice(-14).map((d) => ({ key: d.date, label: narrowDay(d.date), kcal: netOf(d), perDay: netOf(d), logged: d.logged }))
      : Array.from({ length: 8 }, (_, i) => {
          const start = shiftDate(weekStart(today), (i - 7) * 7);
          const days = weekDays(entries, start, today);
          const logged = days.filter((d) => d.logged);
          const kcal = Math.max(0, days.reduce((s, d) => s + d.n.calories - d.burned, 0));
          const perDay = logged.length ? logged.reduce((s, d) => s + netOf(d), 0) / logged.length : 0;
          return { key: start, label: dayMonth(start), kcal, perDay, logged: logged.length > 0, partial: logged.length < 7 };
        });
  // Today is incomplete, so it's excluded from averages.
  const logged = recent.filter((d) => d.logged && d.date !== today);
  const avgIntake = logged.length ? logged.reduce((s, d) => s + netOf(d), 0) / logged.length : null;
  const avgDeficit = avgIntake !== null ? t.tdee - avgIntake : null;
  const estLossKg = logged.reduce((s, d) => s + (t.tdee - netOf(d)), 0) / KCAL_PER_KG_FAT;

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

      <WeekCard t={t} entries={entries} today={today} />

      <section className="card stack">
        <h2>Calories · {view === "day" ? "last 14 days" : "last 8 weeks"}</h2>
        <ViewToggle view={view} setView={setView} />
        <CalorieBars bars={bars} target={t.calories} tdee={t.tdee} scale={view === "week" ? 7 : 1} />
        <div className="grid2 small">
          <div><div className="muted">Avg net per logged day</div><b className="num">{avgIntake !== null ? `${Math.round(avgIntake)} kcal` : "—"}</b></div>
          <div><div className="muted">{view === "day" ? "Avg daily deficit" : "Avg weekly deficit"}</div><b className="num" style={{ color: (avgDeficit ?? 0) >= 0 ? "var(--accent)" : "var(--danger)" }}>{avgDeficit !== null ? `${Math.round(avgDeficit * (view === "day" ? 1 : 7)).toLocaleString()} kcal` : "—"}</b></div>
          <div><div className="muted">Est. fat lost (from logs)</div><b className="num">{logged.length ? `${estLossKg.toFixed(2)} kg` : "—"}</b></div>
          <div><div className="muted">Projected goal date</div><b>{projectedDate ?? "—"}</b></div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Estimates assume your maintenance is {Math.round(t.tdee)} kcal. If your trend weight drops slower than predicted over
          3–4 weeks, you are likely under-logging or maintenance is lower; trim the target by ~100–200 kcal.
        </p>
      </section>

      <NutrientStats t={t} entries={entries} today={today} view={view} setView={setView} />
    </>
  );
}
