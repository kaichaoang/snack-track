"use client";

import { useState } from "react";
import { listModels } from "@/lib/gemini";
import { useGeminiKey, useGeminiModel, useGeminiModels } from "@/lib/store";

export function GeminiCard() {
  const [key, setKey] = useGeminiKey();
  const [model, setModel] = useGeminiModel();
  const [savedModels, setSavedModels] = useGeminiModels();
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(k: string) {
    setBusy(true);
    setError(null);
    try {
      const found = await listModels(k);
      if (found.length === 0) throw new Error("No usable Gemini models found for this key.");
      setKey(k);
      setModels(found);
      setSavedModels(found);
      if (!model || !found.includes(model)) setModel(found[0]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>AI meal estimates (free)</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Uses Google Gemini&apos;s free tier, which can search the web for restaurant nutrition facts and read photos. Get a key
        (no card needed) at{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. The key
        is saved only in this browser and not included in backups. On the free tier Google may use what you send to improve
        its products. Some free keys have no web-search allowance; the app then estimates without searching and says so.
      </p>

      {key ? (
        <>
          <div className="row">
            <code className="grow small">{`${key.slice(0, 6)}…${key.slice(-4)}`}</code>
            <button
              className="danger"
              onClick={() => {
                setKey("");
                setModels(null);
                setSavedModels([]);
              }}
            >
              Remove
            </button>
          </div>
          <label className="field">
            <span>Model</span>
            {models ? (
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <div className="row">
                <code className="grow small">{model || "auto"}</code>
                <button disabled={busy} onClick={() => connect(key)}>{busy ? <span className="spinner" /> : "Change"}</button>
              </div>
            )}
          </label>
        </>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) connect(draft.trim());
          }}
        >
          <input
            className="grow"
            type="password"
            autoComplete="off"
            placeholder="Paste Gemini API key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="primary" disabled={!draft.trim() || busy}>{busy ? <span className="spinner" /> : "Connect"}</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}
