"use client";

import { useState } from "react";
import type { Nutrients } from "@/lib/nutrition";
import { MEAL_SLOTS, type FoodEntry, type MealSlot } from "@/lib/store";

const FIELDS: { key: keyof Nutrients; label: string }[] = [
  { key: "calories", label: "kcal" },
  { key: "proteinG", label: "Protein g" },
  { key: "carbsG", label: "Carbs g" },
  { key: "fatG", label: "Fat g" },
  { key: "fiberG", label: "Fibre g" },
  { key: "sugarG", label: "Sugar g" },
  { key: "saturatedFatG", label: "Sat fat g" },
  { key: "sodiumMg", label: "Sodium mg" },
];

/** In-place editor for a logged entry, shown inside the food log in place of its row. */
export function EditEntry({
  entry,
  onSave,
  onCancel,
}: {
  entry: FoodEntry;
  onSave: (e: FoodEntry) => void;
  onCancel: () => void;
}) {
  const [e, setE] = useState<FoodEntry>(entry);
  const setN = (k: keyof Nutrients, v: number) => setE({ ...e, nutrients: { ...e.nutrients, [k]: v } });

  return (
    <div className="edit-card stack">
      <h3 style={{ margin: 0, textTransform: "none", color: "var(--text)" }}>Edit meal</h3>
      <label className="field">
        <span>What</span>
        <textarea rows={3} value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
      </label>
      <label className="field">
        <span>Portion</span>
        <input value={e.portion} onChange={(ev) => setE({ ...e, portion: ev.target.value })} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Meal</span>
          <select value={e.meal} onChange={(ev) => setE({ ...e, meal: ev.target.value as MealSlot })}>
            {MEAL_SLOTS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={e.date} onChange={(ev) => ev.target.value && setE({ ...e, date: ev.target.value })} />
        </label>
      </div>
      <div className="mini-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <input
              type="number"
              inputMode="decimal"
              value={Math.round(e.nutrients[f.key] * 10) / 10 || ""}
              placeholder="0"
              onChange={(ev) => setN(f.key, parseFloat(ev.target.value) || 0)}
            />
          </label>
        ))}
      </div>
      <div className="form-btns">
        <button className="primary" disabled={!e.name.trim()} onClick={() => onSave({ ...e, name: e.name.trim() })}>
          Save changes
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
