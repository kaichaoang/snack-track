"use client";

// Cloud sync with Supabase.
//
// localStorage stays the working copy so the app is instant and works offline.
// Every change is applied locally and queued; the queue is sent to Supabase
// when signed in and online. On app load the queue is flushed and then the
// server copy is pulled, so other devices' changes show up.
//
// The tables are not readable with the public key; every call goes through a
// SECURITY DEFINER function that checks the session token (see supabase/).

import type { Profile } from "./nutrition";
import { KEYS, read, write, useStored, type FoodEntry, type WeightEntry } from "./store";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

export interface Session {
  token: string;
  username: string;
  displayName: string;
}

type Op =
  | { t: "entries"; entries: FoodEntry[] }
  | { t: "deleteEntry"; id: string }
  | { t: "weight"; weight: WeightEntry }
  | { t: "deleteWeight"; date: string }
  | { t: "profile"; profile: Profile };

export type SyncStatus = "local" | "synced" | "pending" | "syncing" | "error";

class RpcError extends Error {
  /** True for "Session expired" and similar: the user must sign in again. */
  readonly auth: boolean;
  constructor(message: string, auth = false) {
    super(message);
    this.auth = auth;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new RpcError("No connection. Your changes are kept on this phone and saved when you're back online.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `Sync error (${res.status})`;
    throw new RpcError(msg, /session expired/i.test(msg));
  }
  return body as T;
}

// --- session -----------------------------------------------------------

export function useSession() {
  return useStored<Session | null>(KEYS.session, null);
}

/** Whether this account may use AI estimates (from the server). */
export function useAiEnabled() {
  return useStored<boolean>(KEYS.aiEnabled, false)[0];
}

export function useSyncStatus() {
  return useStored<SyncStatus>(KEYS.syncStatus, "local")[0];
}

const session = () => read<Session | null>(KEYS.session, null);
const setStatus = (s: SyncStatus) => {
  if (read(KEYS.syncStatus, "local") !== s) write(KEYS.syncStatus, s);
};

interface UserJson {
  id: string;
  username: string;
  display_name: string;
  token?: string;
  error?: string;
}

/** Log in (or create an account), then merge this device's data with the account's. */
export async function signIn(username: string, password: string, create: boolean): Promise<void> {
  const u = await rpc<UserJson>(create ? "register_user" : "login_user", { p_username: username, p_password: password });
  if (u.error || !u.token) throw new Error(u.error ?? "Couldn't sign in.");
  write<Session>(KEYS.session, { token: u.token, username: u.username, displayName: u.display_name });
  await mergeLocalIntoAccount();
}

export async function signOut(): Promise<void> {
  const s = session();
  write(KEYS.session, null);
  write(KEYS.syncQueue, []);
  write(KEYS.aiEnabled, false);
  setStatus("local");
  if (s) await rpc("logout", { p_token: s.token }).catch(() => undefined);
}

interface Remote {
  profile: Profile | null;
  entries: FoodEntry[];
  weights: { date: string; kg: number | string }[];
  ai?: boolean;
}

/** First sign-in on a device: upload anything the account doesn't have yet, then pull. */
async function mergeLocalIntoAccount() {
  const s = session();
  if (!s) return;
  setStatus("syncing");
  const remote = await rpc<Remote>("snack_load", { p_token: s.token });
  write(KEYS.aiEnabled, !!remote.ai);
  const remoteIds = new Set(remote.entries.map((e) => e.id));
  const remoteDays = new Set(remote.weights.map((w) => w.date));
  const ops: Op[] = [];
  const localEntries = read<FoodEntry[]>(KEYS.entries, []).filter((e) => !remoteIds.has(e.id));
  if (localEntries.length) ops.push({ t: "entries", entries: localEntries });
  for (const w of read<WeightEntry[]>(KEYS.weights, [])) if (!remoteDays.has(w.date)) ops.push({ t: "weight", weight: w });
  const localProfile = read<Profile | null>(KEYS.profile, null);
  if (!remote.profile && localProfile) ops.push({ t: "profile", profile: localProfile });
  write(KEYS.syncQueue, [...read<Op[]>(KEYS.syncQueue, []), ...ops]);
  await syncNow();
}

// --- queue -------------------------------------------------------------

function enqueue(op: Op) {
  if (!session()) return; // not signed in: local only
  write(KEYS.syncQueue, [...read<Op[]>(KEYS.syncQueue, []), op]);
  setStatus("pending");
  void flush();
}

let flushing: Promise<boolean> | null = null;

/** Sends queued changes. Resolves true when the queue is empty. */
function flush(): Promise<boolean> {
  if (!flushing) {
    flushing = doFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function doFlush(): Promise<boolean> {
  const s = session();
  if (!s) return false;
  for (;;) {
    const queue = read<Op[]>(KEYS.syncQueue, []);
    if (queue.length === 0) return true;
    const op = queue[0];
    setStatus("syncing");
    try {
      switch (op.t) {
        case "entries":
          for (let i = 0; i < op.entries.length; i += 500) {
            await rpc("snack_upsert_entries", { p_token: s.token, p_entries: op.entries.slice(i, i + 500) });
          }
          break;
        case "deleteEntry":
          await rpc("snack_delete_entry", { p_token: s.token, p_id: op.id });
          break;
        case "weight":
          await rpc("snack_set_weight", { p_token: s.token, p_day: op.weight.date, p_kg: op.weight.kg });
          break;
        case "deleteWeight":
          await rpc("snack_delete_weight", { p_token: s.token, p_day: op.date });
          break;
        case "profile":
          await rpc("snack_save_profile", { p_token: s.token, p_profile: op.profile });
          break;
      }
    } catch (e) {
      if (e instanceof RpcError && e.auth) {
        // Keep local data; ask to sign in again.
        write(KEYS.session, null);
        setStatus("error");
        return false;
      }
      setStatus(navigator.onLine === false ? "pending" : "error");
      return false;
    }
    // Drop the op we just sent (new ops may have been appended meanwhile).
    write(KEYS.syncQueue, read<Op[]>(KEYS.syncQueue, []).slice(1));
  }
}

/** Flush pending changes, then replace the local copy with the account's data. */
export async function syncNow(): Promise<void> {
  const s = session();
  if (!s) return;
  if (!(await flush())) return; // don't overwrite unsent local changes
  try {
    setStatus("syncing");
    const remote = await rpc<Remote>("snack_load", { p_token: s.token });
    let profile = remote.profile ?? read<Profile | null>(KEYS.profile, null);
    let entries = remote.entries;
    let weights: WeightEntry[] = remote.weights.map((w) => ({ date: w.date, kg: Number(w.kg) }));
    // Changes made while the pull was in flight are still queued: keep showing them.
    const pending = read<Op[]>(KEYS.syncQueue, []);
    for (const op of pending) {
      if (op.t === "entries") {
        const ids = new Set(op.entries.map((e) => e.id));
        entries = [...entries.filter((e) => !ids.has(e.id)), ...op.entries];
      } else if (op.t === "deleteEntry") entries = entries.filter((e) => e.id !== op.id);
      else if (op.t === "weight") weights = [...weights.filter((w) => w.date !== op.weight.date), op.weight];
      else if (op.t === "deleteWeight") weights = weights.filter((w) => w.date !== op.date);
      else profile = op.profile;
    }
    write(KEYS.aiEnabled, !!remote.ai);
    if (profile) write(KEYS.profile, profile);
    write(KEYS.entries, entries);
    write(KEYS.weights, weights);
    setStatus(pending.length ? "pending" : "synced");
  } catch (e) {
    if (e instanceof RpcError && e.auth) write(KEYS.session, null);
    setStatus("error");
  }
}

// --- mutations used by the UI (local write + queue) --------------------

export function addEntries(added: FoodEntry[]) {
  write(KEYS.entries, [...read<FoodEntry[]>(KEYS.entries, []), ...added]);
  enqueue({ t: "entries", entries: added });
}

export function deleteEntry(id: string) {
  write(KEYS.entries, read<FoodEntry[]>(KEYS.entries, []).filter((e) => e.id !== id));
  enqueue({ t: "deleteEntry", id });
}

export function putWeight(w: WeightEntry) {
  write(KEYS.weights, [...read<WeightEntry[]>(KEYS.weights, []).filter((x) => x.date !== w.date), w]);
  enqueue({ t: "weight", weight: w });
}

export function deleteWeight(date: string) {
  write(KEYS.weights, read<WeightEntry[]>(KEYS.weights, []).filter((w) => w.date !== date));
  enqueue({ t: "deleteWeight", date });
}

export function saveProfile(p: Profile) {
  write(KEYS.profile, p);
  enqueue({ t: "profile", profile: p });
}

/** After importing a backup, upload all of it. */
export function uploadAll() {
  const entries = read<FoodEntry[]>(KEYS.entries, []);
  if (entries.length) enqueue({ t: "entries", entries });
  for (const w of read<WeightEntry[]>(KEYS.weights, [])) enqueue({ t: "weight", weight: w });
  const p = read<Profile | null>(KEYS.profile, null);
  if (p) enqueue({ t: "profile", profile: p });
}

/** Call once on app start: sync now, and again whenever the device comes back online. */
export function startSync(): () => void {
  void syncNow();
  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
