"use client";

import { useEffect, useState } from "react";
import { localDateKey, targets } from "@/lib/nutrition";
import { exportAll, importAll, useEntries, useProfile, useWeights, type WeightEntry } from "@/lib/store";
import { addEntries, deleteEntry, deleteWeight, putWeight, saveProfile, startSync, uploadAll, useSession, useSyncStatus } from "@/lib/sync";
import { AccountCard } from "@/components/AccountCard";
import { ProfileForm } from "@/components/ProfileForm";
import { TodayView } from "@/components/TodayView";
import { AddFood } from "@/components/AddFood";
import { ProgressView } from "@/components/ProgressView";
import { GeminiCard } from "@/components/GeminiCard";

type Tab = "today" | "add" | "progress" | "settings";

const ICONS: Record<Tab, React.ReactNode> = {
  today: <path d="M4 5h16v15H4zM4 9h16M9 3v4M15 3v4" />,
  add: <path d="M12 5v14M5 12h14" />,
  progress: <path d="M4 19l5-6 4 3 7-9" />,
  settings: <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7" />,
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
  useEffect(() => setMounted(true), []);
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
        <p className="muted small">Already use SnackTrack (or SplitDumb)? Sign in to load your goal and history.</p>
        <AccountCard />
      </main>
    );
  }

  const t = targets(profile);

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
            <span title="Cloud sync" style={{ marginLeft: 6 }}>{syncStatus === "error" ? "⚠︎" : "⟳"}</span>
          )}
        </span>
      </header>

      {tab === "today" && (
        <TodayView
          date={date}
          setDate={setDate}
          entries={entries}
          t={t}
          onDelete={deleteEntry}
          onAdd={() => setTab("add")}
        />
      )}

      {tab === "add" && (
        <AddFood
          date={date}
          entries={entries}
          onCancel={() => setTab("today")}
          onOpenSettings={() => setTab("settings")}
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
          onDeleteWeight={deleteWeight}
        />
      )}

      {tab === "settings" && (
        <>
          <section className="card">
            <h2>Your goal</h2>
            <ProfileForm initial={profile} onSave={(p) => { saveProfile(p); setTab("today"); }} />
          </section>
          <AccountCard />
          <GeminiCard />
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
            Dish values are typical servings and vary by stall. This app is not medical advice; if you have a health condition,
            check targets with a doctor or dietitian.
          </p>
        </>
      )}

      <nav className="tabs">
        <div className="inner">
          {(Object.keys(LABELS) as Tab[]).map((k) => (
            <button key={k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {ICONS[k]}
              </svg>
              {LABELS[k]}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
