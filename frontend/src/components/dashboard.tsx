"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowLeft,
  Download,
  FileVideo,
  Loader2,
  RefreshCw,
  Check,
  Sparkles,
  Play,
} from "lucide-react";
import {
  platforms,
  type AnalysisResult,
  type PlatformId,
  type RewriteRequest,
  type Suggestions,
} from "@/lib/contracts";
import { makeDemoResult, makeSuggestions } from "@/lib/demo";
import { API_MODE, analysisApi, delay, waitForAnalysis } from "@/lib/api";
import { timecode } from "@/lib/video";
import { useSession } from "./session";
import { CopyButton, PlatformIcon } from "./ui";

const exampleResult = makeDemoResult({
  name: "Make something.webm",
  durationSeconds: 24,
  width: 720,
  height: 1280,
});
const nameOf = (id: PlatformId) => platforms.find((p) => p.id === id)!.name;
export function Dashboard({
  demo = false,
  analysisId,
  initialView = "overview",
  embedded = false,
}: {
  demo?: boolean;
  analysisId?: string;
  initialView?: string;
  embedded?: boolean;
}) {
  const session = useSession();
  const [loadError, setLoadError] = useState("");
  const [loadStage, setLoadStage] = useState("Opening your report…");
  const { setResult } = session;
  const result = demo
    ? exampleResult
    : session.result && (!analysisId || session.result.id === analysisId)
      ? session.result
      : null;
  useEffect(() => {
    if (!analysisId || demo || result || API_MODE !== "live") return;
    const controller = new AbortController();
    analysisApi
      .get(analysisId, controller.signal)
      .then((job) =>
        waitForAnalysis(job, controller.signal, (value) =>
          setLoadStage(value.stage),
        ),
      )
      .then((value) => {
        if (value.mode !== "live")
          throw new Error("The live service returned demo data.");
        setResult(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not open this report.",
          );
      });
    return () => controller.abort();
  }, [analysisId, demo, result, setResult]);
  if (!result && analysisId && API_MODE === "live" && !demo && !loadError)
    return (
      <div className="empty-state" role="status">
        <Loader2 className="spin" />
        <h1>{loadStage}</h1>
        <p>Retrieving the analysis from your configured service.</p>
        <Link className="text-link" href="/studio">
          Return to studio
        </Link>
      </div>
    );
  if (!result)
    return (
      <div className="empty-state">
        <FileVideo size={42} />
        <h1>A fresh canvas.</h1>
        <p role={loadError ? "alert" : undefined}>
          {loadError
            ? `${loadError} Start a new analysis or explore the sample studio.`
            : "Your analysis lives in this session. Add a video to get started, or explore the sample studio."}
        </p>
        <div className="button-row">
          <Link className="button button-accent" href="/upload">
            Choose a video <ArrowUpRight size={19} />
          </Link>
          <Link className="button button-outline" href="/demo">
            Explore demo
          </Link>
        </div>
      </div>
    );
  return (
    <AnalysisStudio
      key={result.id + result.video.name}
      result={result}
      videoUrl={demo ? "/demo.webm" : session.videoUrl}
      initialView={initialView}
      embedded={embedded}
    />
  );
}
function AnalysisStudio({
  result,
  videoUrl,
  initialView,
  embedded,
}: {
  result: AnalysisResult;
  videoUrl: string | null;
  initialView: string;
  embedded: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [report, setReport] = useState(result);
  const [tone, setTone] = useState<RewriteRequest["tone"]>("direct");
  const [selected, setSelected] = useState(result.platforms[0].id);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [activeObservation, setActiveObservation] = useState(
    result.observations[0]?.id ?? "",
  );
  const video = useRef<HTMLVideoElement>(null);
  const active = result.platforms.find((p) => p.id === selected)!;
  const best = result.platforms.reduce((a, b) => (a.score > b.score ? a : b));
  function seek(time: number, id?: string) {
    const target = Math.min(
      time,
      video.current?.duration || result.video.durationSeconds,
    );
    if (video.current) video.current.currentTime = target;
    setCurrentTime(target);
    if (id) setActiveObservation(id);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `viralpilot-${result.mode}-analysis.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div
      className={`studio-page page-gutter ${embedded ? "embedded-report" : ""}`}
    >
      <div className="studio-title">
        <div>
          <Link href="/upload" className="back-link">
            <ArrowLeft size={15} /> Your studio
          </Link>
          <h1>
            {embedded ? "Make every post count." : "Your video’s next move."}
          </h1>
          <p>
            <FileVideo size={15} />
            {result.video.name}
            <span>·</span>
            {timecode(result.video.durationSeconds)}
            <span>·</span>
            {result.video.width} × {result.video.height}
          </p>
        </div>
        <div className="button-row">
          <button
            className="button button-outline button-small"
            onClick={download}
          >
            <Download size={16} /> Export report
          </button>
          <Link href="/upload" className="button button-light button-small">
            New video <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      <div className="demo-notice">
        <span className="status-dot" />
        <p>
          {result.mode === "demo" ? (
            <>
              <strong>Demo mode.</strong> These are illustrative insights, not
              an AI analysis of your video.
            </>
          ) : (
            <>
              <strong>AI-generated estimates.</strong> Use these as creative
              guidance, not predictions of virality.
            </>
          )}
        </p>
      </div>
      <div className="studio-tabs" role="tablist" aria-label="Analysis views">
        {[
          ["overview", "Platform overview"],
          ["insights", "Video insights"],
          ["optimizer", "Content optimizer"],
        ].map(([id, label]) => (
          <button
            id={`tab-${id}`}
            key={id}
            role="tab"
            aria-selected={view === id}
            aria-controls={`panel-${id}`}
            tabIndex={view === id ? 0 : -1}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const ids = ["overview", "insights", "optimizer"];
                const index =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 2
                      : (ids.indexOf(view) +
                          (event.key === "ArrowRight" ? 1 : 2)) %
                        3;
                setView(ids[index]);
                document.getElementById(`tab-${ids[index]}`)?.focus();
              }
            }}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        {view === "overview" && (
          <>
            <div className="comparison-heading">
              <h2>Find your strongest fit.</h2>
              <span>Content-readiness estimates / 100</span>
            </div>
            <div className="score-grid">
              {result.platforms.map((p) => (
                <button
                  key={p.id}
                  className={`score-card ${selected === p.id ? "selected" : ""}`}
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                >
                  <div className="score-card-heading">
                    <PlatformIcon id={p.id} />
                    <span>{nameOf(p.id)}</span>
                    {best.id === p.id && (
                      <span className="best-label">Best fit</span>
                    )}
                  </div>
                  <div className="score-number">
                    {p.score}
                    <span>/ 100</span>
                    <ArrowUpRight size={28} />
                  </div>
                  <div className="score-track">
                    <motion.div
                      initial={false}
                      animate={{ width: `${p.score}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                  <p>{p.assessment}</p>
                </button>
              ))}
            </div>
            <div className="platform-detail">
              <div>
                <h3>{nameOf(selected)} at a glance</h3>
                <p>{active.assessment}</p>
              </div>
              <div className="metric-group">
                {[
                  ["Hook strength", active.hook],
                  ["Pacing", active.pacing],
                  ["Format fit", active.format],
                ].map(([label, value]) => (
                  <div className="metric" key={label}>
                    <span>{label}</span>
                    <strong>
                      {value}
                      <span>/100</span>
                    </strong>
                    <meter
                      min={0}
                      max={100}
                      value={Number(value)}
                      aria-label={String(label)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="comparison-details">
              <section
                className="comparison-chart"
                aria-label="Platform comparison chart"
              >
                <h3>The same idea, through four lenses.</h3>
                <p>
                  Hook, pacing and format fit, compared on a 100-point scale.
                </p>
                <div className="chart-legend">
                  <span>Hook</span>
                  <span>Pacing</span>
                  <span>Format</span>
                </div>
                {result.platforms.map((p) => (
                  <div className="comparison-chart-row" key={p.id}>
                    <strong>{nameOf(p.id)}</strong>
                    <div>
                      {[
                        ["Hook", p.hook],
                        ["Pacing", p.pacing],
                        ["Format", p.format],
                      ].map(([label, value], i) => (
                        <div key={label} className={`comparison-bar bar-${i}`}>
                          <span style={{ width: `${value}%` }} />
                          <b>
                            {label}: {value}
                          </b>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
              <section className="platform-opportunities">
                <h3>Your next edit for {nameOf(selected)}.</h3>
                <p>{active.assessment}</p>
                <ul>
                  {active.opportunities.map((item) => (
                    <li key={item}>
                      <ArrowUpRight size={18} />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  className="text-link"
                  onClick={() => setView("optimizer")}
                >
                  Explore tailored copy <ArrowUpRight size={17} />
                </button>
              </section>
            </div>
          </>
        )}
        {(view === "overview" || view === "insights") && (
          <div className="insight-grid">
            <section className="video-panel">
              <div className="panel-heading">
                <h2>The video, with perspective.</h2>
                <span>
                  {result.mode === "demo"
                    ? "Sample observations"
                    : "AI observations"}
                </span>
              </div>
              <div className="video-screen">
                {videoUrl && !mediaError ? (
                  <video
                    ref={video}
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onError={() => setMediaError(true)}
                    onTimeUpdate={() =>
                      setCurrentTime(video.current?.currentTime ?? 0)
                    }
                    aria-label="Video insights player"
                  />
                ) : (
                  <div className="video-unavailable">
                    <FileVideo />
                    <p>
                      Video preview isn’t available.
                      <br />
                      Your insights are still here.
                    </p>
                    <Link href="/upload" className="text-link">
                      Choose a playable video
                    </Link>
                  </div>
                )}
              </div>
              <div className="timeline">
                <div className="timeline-label">
                  <span>{timecode(currentTime)}</span>
                  <span>{timecode(result.video.durationSeconds)}</span>
                </div>
                <input
                  aria-label="Seek video"
                  type="range"
                  min={0}
                  max={result.video.durationSeconds}
                  step={0.1}
                  value={currentTime}
                  disabled={!videoUrl || mediaError}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <div className="timeline-observations">
                  {result.observations.map((o) => (
                    <button
                      key={o.id}
                      title={`${timecode(o.time)}: ${o.title}`}
                      aria-label={`Seek to ${timecode(o.time)}: ${o.title}`}
                      style={{
                        left: `${Math.min(96, (o.time / result.video.durationSeconds) * 100)}%`,
                      }}
                      onClick={() => seek(o.time, o.id)}
                      className={o.kind}
                      disabled={!videoUrl || mediaError}
                    />
                  ))}
                </div>
              </div>
            </section>
            <section className="observations-panel">
              <div className="panel-heading">
                <h2>Moments that matter.</h2>
                <span>{result.observations.length} observations</span>
              </div>
              <div className="observation-list">
                {result.observations.map((o) => (
                  <button
                    key={o.id}
                    className={`observation ${activeObservation === o.id ? "active" : ""}`}
                    onClick={() => seek(o.time, o.id)}
                    disabled={!videoUrl || mediaError}
                  >
                    <span className={`observation-time ${o.kind}`}>
                      {timecode(o.time)}
                      {o.kind === "strength" ? (
                        <Check size={13} />
                      ) : (
                        <ArrowUpRight size={13} />
                      )}
                    </span>
                    <span>
                      <strong>{o.title}</strong>
                      <span>{o.detail}</span>
                    </span>
                    <Play size={13} />
                  </button>
                ))}
              </div>
              <div className="insight-takeaway">
                <Sparkles size={19} />
                <p>{result.summary}</p>
              </div>
              <button
                className="text-link"
                onClick={() => setView("optimizer")}
              >
                Turn insights into your next edit <ArrowUpRight size={17} />
              </button>
            </section>
          </div>
        )}
        {view === "optimizer" && (
          <Optimizer
            result={report}
            selected={selected}
            onSelect={setSelected}
            tone={tone}
            onTone={setTone}
            onRewrite={(id, suggestions) =>
              setReport((prev) => ({
                ...prev,
                platforms: prev.platforms.map((p) =>
                  p.id === id ? { ...p, suggestions } : p,
                ),
              }))
            }
          />
        )}
      </div>
      <footer className="studio-footer">
        <span>Your creative judgment comes first.</span>
        <span>
          {result.mode === "demo"
            ? "Illustrative estimates"
            : "AI-generated estimates"}{" "}
          · Not a guarantee of performance
        </span>
      </footer>
    </div>
  );
}

function Optimizer({
  result,
  selected,
  onSelect,
  onRewrite,
  tone,
  onTone,
}: {
  result: AnalysisResult;
  selected: PlatformId;
  onSelect: (id: PlatformId) => void;
  onRewrite: (id: PlatformId, suggestions: Suggestions) => void;
  tone: RewriteRequest["tone"];
  onTone: (tone: RewriteRequest["tone"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function regenerate() {
    const controller = new AbortController();
    request.current = controller;
    const target = selected;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let next: Suggestions;
      if (result.mode === "demo") {
        await delay(700, controller.signal);
        next = makeSuggestions(target, tone);
      } else
        next = (
          await analysisApi.rewrite(
            result.id,
            { platform: target, tone },
            controller.signal,
          )
        ).suggestions;
      onRewrite(target, next);
      setNotice(
        result.mode === "demo"
          ? "Sample suggestions updated for this tone."
          : "New suggestions are ready.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Couldn’t generate suggestions. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const value = result.platforms.find((p) => p.id === selected)!.suggestions;
  const copy: [keyof Omit<Suggestions, "edits">, string][] = [
    ["hook", "Opening hook"],
    ["title", "Title"],
    ["caption", "Caption"],
    ["description", "Description"],
    ["cta", "Call to action"],
  ];
  return (
    <section className="optimizer">
      <div className="optimizer-heading">
        <div>
          <h2>A little sharper. Still you.</h2>
          <p>
            {result.mode === "demo"
              ? "Explore sample copy, then make it your own."
              : "Start with AI suggestions. Keep your own voice."}
          </p>
        </div>
        <div className="rewrite-controls">
          <label htmlFor="tone">
            Tone
            <select
              id="tone"
              value={tone}
              disabled={busy}
              onChange={(e) => onTone(e.target.value as RewriteRequest["tone"])}
            >
              <option value="direct">Direct</option>
              <option value="playful">Playful</option>
              <option value="educational">Educational</option>
            </select>
          </label>
          <button
            className="button button-accent button-small"
            disabled={busy}
            onClick={regenerate}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <RefreshCw size={17} />
            )}
            {busy
              ? "Preparing…"
              : result.mode === "demo"
                ? "Try sample tone"
                : "Regenerate"}
          </button>
        </div>
      </div>
      <div
        className="optimizer-platforms"
        role="group"
        aria-label="Suggestion platform"
      >
        {result.platforms.map((p) => (
          <button
            disabled={busy}
            aria-pressed={selected === p.id}
            className={selected === p.id ? "active" : ""}
            key={p.id}
            onClick={() => {
              onSelect(p.id);
              setNotice("");
            }}
          >
            <PlatformIcon id={p.id} size={17} />
            {nameOf(p.id)}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p className="rewrite-status" role="status">
        {notice}
      </p>
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0.5, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0.5 }}
          transition={{ duration: 0.18 }}
          className="suggestion-grid"
        >
          {copy.map(([key, title]) => (
            <article className={`suggestion suggestion-${key}`} key={key}>
              <header>
                <h3>{title}</h3>
                <CopyButton
                  key={`${selected}-${value[key]}`}
                  text={value[key]}
                  label={`Copy ${title.toLowerCase()}`}
                />
              </header>
              <p>{value[key]}</p>
            </article>
          ))}
          <article className="suggestion edits">
            <header>
              <h3>In the edit</h3>
              <CopyButton
                text={value.edits.join("\n")}
                label="Copy editing recommendations"
              />
            </header>
            <ul>
              {value.edits.map((edit) => (
                <li key={edit}>
                  <Check size={16} />
                  {edit}
                </li>
              ))}
            </ul>
          </article>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
