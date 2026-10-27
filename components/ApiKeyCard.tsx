"use client";

import { useState } from "react";
import { useApiKey } from "@/lib/store";

export function ApiKeyCard() {
  const [apiKey, setApiKey] = useApiKey();
  const [draft, setDraft] = useState("");
  const masked = apiKey ? `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}` : null;

  return (
    <section className="card stack">
      <h2>Anthropic API key</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Needed for photo and description estimates. It is saved only in this browser and sent only to api.anthropic.com.
        It is not included in backups. Get a key at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>, and
        consider setting a monthly spend limit there.
      </p>
      {masked ? (
        <div className="row">
          <code className="grow small">{masked}</code>
          <button className="danger" onClick={() => setApiKey("")}>Remove</button>
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              setApiKey(draft.trim());
              setDraft("");
            }
          }}
        >
          <input
            className="grow"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="primary" disabled={!draft.trim()}>Save</button>
        </form>
      )}
    </section>
  );
}
