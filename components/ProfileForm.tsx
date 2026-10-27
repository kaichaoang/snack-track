"use client";

import { useState } from "react";
import {
  ACTIVITY_LABELS,
  targets,
  weeksToGoal,
  type ActivityLevel,
  type Profile,
} from "@/lib/nutrition";

const DEFAULTS: Profile = {
  sex: "male",
  age: 30,
  heightCm: 170,
  weightKg: 75,
  goalWeightKg: 68,
  activity: "light",
  weeklyLossKg: 0.5,
};

export function ProfileForm({
  initial,
  onSave,
  submitLabel = "Save",
}: {
  initial: Profile | null;
  onSave: (p: Profile) => void;
  submitLabel?: string;
}) {
  const [p, setP] = useState<Profile>(initial ?? DEFAULTS);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const numberField = (k: "age" | "heightCm" | "weightKg" | "goalWeightKg", label: string, step = "1") => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isFinite(p[k]) ? p[k] : ""}
        onChange={(e) => set(k, parseFloat(e.target.value))}
      />
    </label>
  );

  const valid = [p.age, p.heightCm, p.weightKg, p.goalWeightKg].every((n) => Number.isFinite(n) && n > 0);
  const t = valid ? targets(p) : null;
  const weeks = t ? weeksToGoal(p, t.dailyDeficit) : null;

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(p);
      }}
    >
      <div className="seg" role="group" aria-label="Sex">
        {(["male", "female"] as const).map((s) => (
          <button type="button" key={s} aria-pressed={p.sex === s} onClick={() => set("sex", s)}>
            {s === "male" ? "Male" : "Female"}
          </button>
        ))}
      </div>
      <div className="grid2">
        {numberField("age", "Age")}
        {numberField("heightCm", "Height (cm)")}
        {numberField("weightKg", "Current weight (kg)", "0.1")}
        {numberField("goalWeightKg", "Goal weight (kg)", "0.1")}
      </div>
      <label className="field">
        <span>Activity level</span>
        <select value={p.activity} onChange={(e) => set("activity", e.target.value as ActivityLevel)}>
          {Object.entries(ACTIVITY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Target loss: {p.weeklyLossKg.toFixed(2)} kg / week</span>
        <input
          type="range"
          min={0.25}
          max={1}
          step={0.05}
          value={p.weeklyLossKg}
          onChange={(e) => set("weeklyLossKg", parseFloat(e.target.value))}
        />
      </label>

      {t && (
        <div className="notice">
          Maintenance is about <b>{Math.round(t.tdee)} kcal</b>/day. Your target is{" "}
          <b>{Math.round(t.calories)} kcal</b>/day (−{Math.round(t.dailyDeficit)} kcal), with{" "}
          <b>{Math.round(t.proteinG)} g</b> protein.
          {weeks !== null && weeks > 0 && (
            <> At that pace you would reach {p.goalWeightKg} kg in about {Math.ceil(weeks)} weeks.</>
          )}
          {t.cappedByFloor && (
            <div className="small" style={{ marginTop: 6, color: "var(--warn)" }}>
              That loss rate would put you below {p.sex === "male" ? 1500 : 1200} kcal/day, so the target is held there.
              Go slower, or add activity.
            </div>
          )}
        </div>
      )}

      <button type="submit" className="primary block" disabled={!valid}>
        {submitLabel}
      </button>
    </form>
  );
}
