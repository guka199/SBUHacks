"use client";

import { useState } from "react";
import { api, type Platform, type ScoreResponse } from "@/lib/api";

const PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube", "linkedin"];

function Bar({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <div className="h-2 flex-1 rounded bg-black/10 dark:bg-white/10">
      <div
        className={`h-2 rounded ${muted ? "bg-foreground/40" : "bg-foreground"}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

export default function ScorePage() {
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(["tiktok", "instagram", "youtube"]);
  const [file, setFile] = useState<File | null>(null);
  const [followers, setFollowers] = useState("");
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: Platform) {
    setPlatforms((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]));
  }

  async function score() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api.score({
          caption,
          platforms,
          file,
          context: followers ? { followers: Number(followers) } : {},
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Score a post</h1>
      {/* TODO: planned posting time picker */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Paste your caption or video title..."
        rows={4}
        className="rounded-md border p-3"
      />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="opacity-70">Image or video</span>
          <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="flex items-center gap-2">
          <span className="opacity-70">Followers</span>
          <input
            type="number"
            min={0}
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
            className="w-28 rounded-md border px-2 py-1"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => togglePlatform(p)}
            className={`rounded-full border px-3 py-1 capitalize ${platforms.includes(p) ? "bg-foreground text-background" : ""}`}
          >
            {p}
          </button>
        ))}
      </div>

      <button
        onClick={score}
        disabled={!caption || platforms.length === 0 || loading}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-40"
      >
        {loading ? (file ? "Analyzing your media..." : "Scoring...") : "Score it"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="flex flex-col gap-6">
          {result.warning && <p className="text-sm opacity-70">{result.warning}</p>}

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 className="font-medium">Predicted score</h2>
              {result.scores.map((s) => (
                <div key={s.platform} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="w-24 capitalize">{s.platform}</span>
                    <Bar value={s.score} />
                    <span className="w-10 text-right font-semibold tabular-nums">{s.score.toFixed(0)}</span>
                  </div>
                  {s.content_score !== null && (
                    <div className="flex gap-4 pl-24 text-xs opacity-60">
                      <span>Our model {s.model_score.toFixed(0)}</span>
                      <span>Content (Gemini) {s.content_score.toFixed(0)}</span>
                    </div>
                  )}
                </div>
              ))}
              {result.gemini_used && (
                <p className="text-xs opacity-50">
                  {Math.round(result.model_weight * 100)}% our model (trained on 1.2M posts) +{" "}
                  {Math.round((1 - result.model_weight) * 100)}% content review
                </p>
              )}
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

          {result.content && (
            <div className="flex flex-col gap-3">
              <h2 className="font-medium">Content review</h2>
              <p className="text-sm opacity-80">{result.content.summary}</p>
              <div className="grid max-w-md gap-2 text-sm">
                {(
                  [
                    ["Hook", result.content.hook],
                    ["Visual quality", result.content.visual_quality],
                    ["Clarity", result.content.clarity],
                    ["Trend fit", result.content.trend_fit],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-28 opacity-70">{label}</span>
                    <Bar value={value} muted />
                    <span className="w-8 text-right tabular-nums">{value}</span>
                  </div>
                ))}
              </div>
              {result.content.strengths.length > 0 && (
                <p className="text-sm">
                  <span className="opacity-70">Working well: </span>
                  {result.content.strengths.join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
