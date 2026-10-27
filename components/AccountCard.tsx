"use client";

import { useState } from "react";
import { signIn, signOut, syncNow, useSession, useSyncStatus, type SyncStatus } from "@/lib/sync";

const STATUS_TEXT: Record<SyncStatus, string> = {
  local: "Not saved yet",
  synced: "Saved",
  pending: "Saving soon",
  syncing: "Saving…",
  error: "Couldn't save, will retry",
};

export function AccountCard() {
  const [session] = useSession();
  const status = useSyncStatus();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(create: boolean) {
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password, create);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <section className="card stack">
        <h2>Account</h2>
        <div className="row between">
          <span>
            Signed in as <b>{session.displayName || session.username}</b>
          </span>
          <span className={`pill ${status === "synced" ? "good" : status === "error" ? "warn" : ""}`}>{STATUS_TEXT[status]}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Your log, weigh-ins and goal are saved to your account, so you can use them on any phone.
        </p>
        <div className="row">
          <button className="grow" disabled={status === "syncing"} onClick={() => void syncNow()}>Refresh</button>
          <button className="grow" onClick={() => void signOut()}>Log out</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h2>Account</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Sign in to keep your history safe and use it on any phone. What you&apos;ve logged on this phone is kept when you
        sign in.
      </p>
      {status === "error" && <div className="error">Your session expired. Please sign in again.</div>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void go(false);
        }}
      >
        <input placeholder="Username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button type="submit" className="primary grow" disabled={busy || !username.trim() || !password}>
            {busy ? <span className="spinner" /> : "Log in"}
          </button>
          <button type="button" className="grow" disabled={busy || !username.trim() || !password} onClick={() => void go(true)}>
            Create account
          </button>
        </div>
      </form>
    </section>
  );
}
