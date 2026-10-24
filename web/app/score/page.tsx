"use client";

import { useState } from "react";
import { api, type PredictResponse } from "@/lib/api";

export default function ScorePage() {
  const [caption, setCaption] = useState("");
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function score() {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.predict({ caption }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Score a post</h1>
      {/* TODO: thumbnail / clip upload, platform picker, planned posting time */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Paste your caption or video title..."
        rows={4}
        className="rounded-md border p-3"
      />
      <button
        onClick={score}
        disabled={!caption || loading}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-40"
      >
        {loading ? "Scoring..." : "Score it"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="font-medium">Predicted score</h2>
            {result.scores.map((s) => (
              <div key={s.platform} className="flex items-center gap-3">
                <span className="w-24 capitalize">{s.platform}</span>
                <div className="h-2 flex-1 rounded bg-black/10 dark:bg-white/10">
                  <div className="h-2 rounded bg-foreground" style={{ width: `${s.score}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums">{s.score}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="font-medium">Suggestions</h2>
            <ol className="list-decimal pl-5 text-sm">
              {result.suggestions.map((s) => (
                <li key={s} className="py-1">
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
