"use client";

import { useState } from "react";
import type { FoodEntry } from "@/lib/store";

/** In-place editor for a logged exercise (name, duration, kcal burned, date). */
export function ExerciseEdit({ entry, onSave, onCancel }: { entry: FoodEntry; onSave: (e: FoodEntry) => void; onCancel: () => void }) {
  const [e, setE] = useState<FoodEntry>(entry);
  return (
    <div className="edit-card stack">
      <h3 style={{ margin: 0, textTransform: "none", color: "var(--text)" }}>Edit exercise</h3>
      <label className="field">
        <span>Activity</span>
        <input value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Duration</span>
          <input value={e.portion} onChange={(ev) => setE({ ...e, portion: ev.target.value })} />
        </label>
        <label className="field">
          <span>kcal burned</span>
          <input
            type="number"
            inputMode="numeric"
            value={e.nutrients.calories || ""}
            placeholder="0"
            onChange={(ev) => setE({ ...e, nutrients: { ...e.nutrients, calories: parseFloat(ev.target.value) || 0 } })}
          />
        </label>
      </div>
      <label className="field">
        <span>Date</span>
        <input type="date" value={e.date} onChange={(ev) => ev.target.value && setE({ ...e, date: ev.target.value })} />
      </label>
      <div className="form-btns">
        <button className="primary" disabled={!e.name.trim()} onClick={() => onSave({ ...e, name: e.name.trim() })}>Save changes</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
