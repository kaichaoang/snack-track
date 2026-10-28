"use client";

import { useEffect, useState } from "react";
import { localDateKey, targets } from "@/lib/nutrition";
import { exportAll, importAll, useEntries, useProfile, useWeights, type WeightEntry } from "@/lib/store";
import { addEntries, deleteEntry, deleteWeight, putWeight, saveProfile, startSync, updateEntry, uploadAll, useSession, useSyncStatus } from "@/lib/sync";
import { AccountCard } from "@/components/AccountCard";
import { ProfileForm } from "@/components/ProfileForm";
import { TodayView } from "@/components/TodayView";
import { AddFood } from "@/components/AddFood";
import { ProgressView } from "@/components/ProgressView";

type Tab = "today" | "add" | "progress" | "settings";

// Instagram-style tab icons: outline when idle, bolder (home filled) when active.
const ICONS: Record<Tab, (active: boolean) => React.ReactNode> = {
  today: (a) => <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" fill={a ? "currentColor" : "none"} />,
  add: () => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  progress: () => <path d="M3 17l5.5-5.5 4 4L21 7M15 7h6v6" />,
  settings: () => (
    <>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5" />
    </>
  ),
};
const LABELS: Record<Tab, string> = { today: "Today", add: "Add", progress: "Progress", settings: "Goals" };

export default function Home() {
  const [profile] = useProfile();
  const [entries] = useEntries();
  const [weights] = useWeights();
  const [session] = useSession();
  const syncStatus = useSyncStatus();
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(localDateKey());
  const [mounted, setMounted] = useState(false);
  // Last deletion, offered for Undo for a few seconds.
  const [undo, setUndo] = useState<{ label: string; restore: () => void } | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  useEffect(() => startSync(), []);

  // localStorage is only available after mount; avoid flashing onboarding.
  if (!mounted) return <main className="app" />;

  if (!profile) {
    return (
      <main className="app">
        <header className="top"><h1>SnackTrack</h1></header>
        <section className="card">
          <h2>Set your goal</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            We use this to work out your maintenance calories and a daily target that creates a steady deficit.
          </p>
          <ProfileForm
            initial={null}
            submitLabel="Start tracking"
            onSave={(p) => {
              saveProfile(p);
              putWeight({ date: localDateKey(), kg: p.weightKg });
            }}
          />
        </section>
        <p className="muted small">Already have an account? Sign in to load your goal and history.</p>
        <AccountCard />
      </main>
    );
  }

  const t = targets(profile);

  const removeEntry = (id: string) => {
    const e = entries.find((x) => x.id === id);
    deleteEntry(id);
    if (e) setUndo({ label: e.name, restore: () => addEntries([e]) });
  };

  const removeWeight = (d: string) => {
    const w = weights.find((x) => x.date === d);
    deleteWeight(d);
    if (w) setUndo({ label: "weigh-in", restore: () => putWeight(w) });
  };

  const logWeight = (w: WeightEntry) => {
    putWeight(w);
    // Keep targets in step with current weight.
    saveProfile({ ...profile, weightKg: w.kg });
  };

  return (
    <main className="app">
      <header className="top">
        <h1>SnackTrack</h1>
        <span className="sub num">
          {Math.round(t.calories)} kcal/day target
          {session && syncStatus !== "synced" && syncStatus !== "local" && (
            <span title="Saving" style={{ marginLeft: 6 }}>{syncStatus === "error" ? "⚠︎" : "⟳"}</span>
          )}
        </span>
      </header>

      {tab === "today" && (
        <TodayView
          date={date}
          setDate={setDate}
          entries={entries}
          t={t}
          onDelete={removeEntry}
          onUpdate={updateEntry}
          onAdd={() => setTab("add")}
        />
      )}

      {tab === "add" && (
        <AddFood
          date={date}
          entries={entries}
          weightKg={profile.weightKg}
          onCancel={() => setTab("today")}
          onSave={(added) => {
            addEntries(added);
            setTab("today");
          }}
        />
      )}

      {tab === "progress" && (
        <ProgressView
          profile={profile}
          t={t}
          entries={entries}
          weights={weights}
          onLogWeight={logWeight}
          onDeleteWeight={removeWeight}
        />
      )}

      {tab === "settings" && (
        <>
          <section className="card">
            <h2>Your goal</h2>
            <ProfileForm initial={profile} onSave={(p) => { saveProfile(p); setTab("today"); }} />
          </section>
          <AccountCard />
          <section className="card stack">
            <h2>Your data</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {session
                ? "Your data is saved to your account. You can also export a backup file."
                : "Without an account, everything is stored only in this browser. Export a backup to keep a copy."}
            </p>
            <div className="row">
              <button
                className="grow"
                onClick={() => {
                  const blob = new Blob([exportAll()], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `snacktrack-${localDateKey()}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Export backup
              </button>
              <label className="grow" style={{ display: "block" }}>
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      importAll(await f.text());
                      uploadAll();
                    } catch {
                      alert("That file isn't a SnackTrack backup.");
                    }
                  }}
                />
                <span className="block" style={{ display: "block", textAlign: "center", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", cursor: "pointer" }}>
                  Import backup
                </span>
              </label>
            </div>
          </section>
          <p className="small muted">
            Estimates are approximate and lean high on purpose. This app is not medical advice; if you have a health condition,
            check targets with a doctor or dietitian.
          </p>
        </>
      )}

      {undo && (
        <div className="toast" role="status">
          <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Deleted {undo.label}
          </span>
          <button
            onClick={() => {
              undo.restore();
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}

      <nav className="tabs">
        <div className="inner">
          {(Object.keys(LABELS) as Tab[]).map((k) => (
            <button
              key={k}
              aria-label={LABELS[k]}
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === k ? 2.4 : 1.7} strokeLinecap="round" strokeLinejoin="round">
                {ICONS[k](tab === k)}
              </svg>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
