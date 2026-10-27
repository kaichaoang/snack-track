"use client";

// Browser-local persistence. Everything lives in localStorage on this device;
// there is no account or server-side database.

import { useCallback, useSyncExternalStore } from "react";
import type { Nutrients, Profile } from "./nutrition";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export interface Source {
  title: string;
  url: string;
}

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD, local
  createdAt: number;
  meal: MealSlot;
  name: string;
  portion: string;
  nutrients: Nutrients;
  origin: "ai" | "described" | "dish" | "database" | "manual";
  place?: string;
  sources?: Source[];
}

export interface WeightEntry {
  date: string;
  kg: number;
}

const KEYS = {
  profile: "snacktrack.profile.v1",
  entries: "snacktrack.entries.v1",
  weights: "snacktrack.weights.v1",
  // Not part of exportAll(), so backups never contain the key.
  geminiKey: "snacktrack.geminiKey.v1",
  geminiModel: "snacktrack.geminiModel.v1",
  geminiModels: "snacktrack.geminiModels.v1",
} as const;

// Earlier versions stored an Anthropic API key; remove it if present.
try {
  if (typeof localStorage !== "undefined") localStorage.removeItem("snacktrack.anthropicKey.v1");
} catch {
  // Storage blocked: nothing to remove.
}

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Storage blocked (private mode etc.): behave as empty.
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Could not save", e);
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function useStored<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read(key, fallback);
      write(key, typeof next === "function" ? (next as (p: T) => T)(prev) : next);
    },
    [key, fallback],
  );
  return [value, set];
}

const NO_ENTRIES: FoodEntry[] = [];
const NO_WEIGHTS: WeightEntry[] = [];

export function useProfile() {
  return useStored<Profile | null>(KEYS.profile, null);
}

export function useEntries() {
  return useStored<FoodEntry[]>(KEYS.entries, NO_ENTRIES);
}

export function useWeights() {
  return useStored<WeightEntry[]>(KEYS.weights, NO_WEIGHTS);
}

export function useGeminiKey() {
  return useStored<string>(KEYS.geminiKey, "");
}

export function useGeminiModel() {
  return useStored<string>(KEYS.geminiModel, "");
}

const NO_MODELS: string[] = [];

/** Models the key can use, best first; used as fallbacks when one is busy. */
export function useGeminiModels() {
  return useStored<string[]>(KEYS.geminiModels, NO_MODELS);
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function defaultMealSlot(d = new Date()): MealSlot {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export function exportAll(): string {
  return JSON.stringify(
    {
      profile: read(KEYS.profile, null),
      entries: read(KEYS.entries, NO_ENTRIES),
      weights: read(KEYS.weights, NO_WEIGHTS),
    },
    null,
    2,
  );
}

export function importAll(json: string) {
  const data = JSON.parse(json) as { profile?: Profile; entries?: FoodEntry[]; weights?: WeightEntry[] };
  if (data.profile) write(KEYS.profile, data.profile);
  if (Array.isArray(data.entries)) write(KEYS.entries, data.entries);
  if (Array.isArray(data.weights)) write(KEYS.weights, data.weights);
}
