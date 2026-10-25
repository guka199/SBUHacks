"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowLeft,
  Download,
  FileVideo,
  Loader2,
  RefreshCw,
  Check,
  Play,
} from "lucide-react";
import {
  platforms,
  type AnalysisResult,
  type PlatformId,
  type RewriteRequest,
  type Suggestions,
  type PlatformResult,
} from "@/lib/contracts";
import { makeDemoResult, makeSuggestions } from "@/lib/demo";
import { API_MODE, analysisApi, delay, waitForAnalysis } from "@/lib/api";
import { timecode } from "@/lib/video";
import { collectReview, thumbnailLeaders } from "@/lib/review";
import { useSession } from "./session";
import { CopyButton, PlatformIcon } from "./ui";
import { useAuth } from "@/lib/auth";
import { HookReview } from "./hook-review";

const exampleResult = makeDemoResult({
  name: "Make something.webm",
  durationSeconds: 24,
  width: 720,
  height: 1280,
});
const nameOf = (id: PlatformId) => platforms.find((p) => p.id === id)!.name;
type Observation = AnalysisResult["observations"][number];
const kindLabels: Record<Observation["kind"], string> = {
  strength: "Works well",
  opportunity: "Opportunity",
  unclear: "Unclear",
  pacing: "Hurts pacing",
  improve: "Needs improving",
};
function metricsOf(
  platform: PlatformResult,
  live: boolean,
): [string, number | null][] {
  return live
    ? [
        ["Hook strength", platform.hook],
        ["Visual quality", platform.visualQuality ?? null],
        ["Clarity", platform.clarity ?? null],
      ]
    : [
        ["Hook strength", platform.hook],
        ["Pacing", platform.pacing],
        ["Format fit", platform.format],
      ];
}
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
  const { user, loading } = useAuth();
  const [loadError, setLoadError] = useState("");
  const [loadStage, setLoadStage] = useState("Opening your report…");
  const { setResult } = session;
  const result = demo
    ? exampleResult
    : session.result &&
        (session.result.mode === "demo" || user) &&
        (!analysisId || session.result.id === analysisId)
      ? session.result
      : null;
  useEffect(() => {
    if (!analysisId || demo || result || API_MODE !== "live" || !user) return;
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
  }, [analysisId, demo, result, setResult, user]);
  if (!demo && analysisId && API_MODE === "live" && !loading && !user)
    return (
      <div className="empty-state">
        <h1>Your private report.</h1>
        <p>Sign in to open this analysis.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/analysis/${analysisId}`)}`}
          className="button button-accent"
        >
          Sign in
        </Link>
      </div>
    );
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
      videoUrl={
        result.mode === "live"
          ? analysisApi.videoUrl(result.id)
          : demo
            ? "/demo.webm"
            : session.videoUrl
      }
      initialView={initialView}
      embedded={embedded}
    />
  );
}
const ratingLabels = {
  good: "Good time",
  okay: "Okay time",
  poor: "Poor time",
  unknown: "No time chosen",
} as const;
const zoneName = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ");
function PostingReview({ result }: { result: AnalysisResult }) {
  const plan = result.posting;
  if (!plan) return null;
  const audienceZone = zoneName(plan.audienceTimezone);
  return (
    <section className="posting-review" aria-labelledby="posting-title">
      <div className="panel-heading">
        <h2 id="posting-title">When and where to post.</h2>
        <span>
          {plan.hasAudienceData
            ? "Based on your audience from Accounts"
            : "General advice · add your audience in Accounts"}
        </span>
      </div>
      <div className="posting-facts">
        <div>
          <span>Posting for</span>
          <strong>{plan.countryName ?? "No country chosen"}</strong>
        </div>
        <div>
          <span>Your plan</span>
          <strong>
            {plan.plannedAudience
              ? `${plan.plannedAudience} ${audienceZone} time`
              : "No time chosen"}
          </strong>
          {plan.plannedPoster &&
            plan.posterTimezone !== plan.audienceTimezone && (
              <small>
                = {plan.plannedPoster} your time (
                {zoneName(plan.posterTimezone!)})
              </small>
            )}
        </div>
      </div>
      <p className="posting-summary">{plan.summary}</p>
      <p className="posting-fit">{plan.audienceFit}</p>
      {!plan.hasAudienceData && (
        <p className="field-note">
          <Link href="/accounts">Add your audience</Link> (ages, countries,
          language) for advice tailored to your viewers.
        </p>
      )}
      <ul className="posting-platforms">
        {plan.platforms.map((p) => (
          <li key={p.platform}>
            <div className="posting-platform-heading">
              <PlatformIcon id={p.platform} />
              <strong>{nameOf(p.platform)}</strong>
              <em className={`posting-rating ${p.rating}`}>
                {ratingLabels[p.rating]}
              </em>
            </div>
            <p>{p.reason}</p>
            <h4>Best windows · {audienceZone} time</h4>
            <ul>
              {p.windows.map((w) => (
                <li key={`${w.days}${w.start}`}>
                  <b>{w.days}</b> {w.start}–{w.end}
                  {w.startLocal && w.endLocal && (
                    <small>
                      {" "}
                      ({w.startLocal}–{w.endLocal} your time)
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {plan.suggestions.length > 0 && (
        <>
          <h3>Make it land there</h3>
          <ul className="posting-suggestions">
            {plan.suggestions.map((text) => (
              <li key={text}>
                <ArrowUpRight size={16} />
                {text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
function ThumbnailReview({ result }: { result: AnalysisResult }) {
  const review = result.thumbnails;
  if (!review?.items.length) return null;
  const leaders = thumbnailLeaders(review);
  const src = (index: number) => analysisApi.thumbnailUrl(result.id, index);
  const shortName = (id: PlatformId) =>
    platforms.find((p) => p.id === id)!.short;
  return (
    <section className="thumbnail-review" aria-labelledby="thumbnail-title">
      <div className="panel-heading">
        <h2 id="thumbnail-title">Which thumbnail to use.</h2>
        <span>Gemini thumbnail comparison</span>
      </div>
      <p className="thumbnail-summary">{review.summary}</p>
      <p className="thumbnail-recommendation">
        <strong>
          {leaders.map((index) => `Thumbnail ${index + 1}`).join(" & ")}
        </strong>{" "}
        ·{" "}
        {leaders.length > 1
          ? "Joint best average score"
          : "Best average score across reviewed platforms"}
      </p>
      <details className="thumbnail-reasons">
        <summary>Platform recommendations</summary>
        <ul>
          {review.picks.map((pick) => (
            <li key={pick.platform}>
              <strong>
                {nameOf(pick.platform)} · Thumbnail {pick.index + 1}
              </strong>{" "}
              — {pick.reason}
            </li>
          ))}
        </ul>
      </details>
      <div className="thumbnail-cards">
        {review.items.map((item) => {
          const wins = review.picks
            .filter((pick) => pick.index === item.index)
            .map((pick) => shortName(pick.platform));
          return (
            <article
              key={item.index}
              className={`thumbnail-card ${leaders.includes(item.index) ? "winner" : ""}`}
            >
              <div className="thumbnail-frame">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, presigned image */}
                <img
                  src={src(item.index)}
                  alt={`Thumbnail ${item.index + 1}: ${item.name}`}
                />
              </div>
              <h3>
                Thumbnail {item.index + 1}
                <span>
                  {item.name} · {item.width} × {item.height}
                </span>
              </h3>
              {(wins.length > 0 || leaders.includes(item.index)) && (
                <p className="best-label">
                  {leaders.includes(item.index) ? "Best overall · " : ""}
                  {wins.length > 0
                    ? `Best for ${wins.join(", ")}`
                    : "Highest average score"}
                </p>
              )}
              <dl className="thumbnail-scores">
                {result.platforms.map((p) => {
                  const value = item.scores[p.id];
                  return (
                    <div key={p.id} title={item.reasons[p.id]}>
                      <dt>{shortName(p.id)}</dt>
                      <dd>
                        <meter
                          min={0}
                          max={100}
                          value={value ?? 0}
                          aria-label={`${nameOf(p.id)} thumbnail score`}
                        />
                        <b>{value ?? "–"}</b>
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {Object.values(item.reasons).some(Boolean) && (
                <details className="thumbnail-score-notes">
                  <summary>Why these scores?</summary>
                  <ul>
                    {result.platforms.map((platform) =>
                      item.reasons[platform.id] ? (
                        <li key={platform.id}>
                          <strong>{nameOf(platform.id)}:</strong>{" "}
                          {item.reasons[platform.id]}
                        </li>
                      ) : null,
                    )}
                  </ul>
                </details>
              )}
              {item.strengths.length > 0 && (
                <>
                  <h4>Works</h4>
                  <ul>
                    {item.strengths.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </>
              )}
              {item.improvements.length > 0 && (
                <>
                  <h4>Improve</h4>
                  <ul>
                    {item.improvements.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
const sameMetrics = (rows: [string, number | null][][]) =>
  rows.every((row) => JSON.stringify(row) === JSON.stringify(rows[0]));

/** One scrolling report; every finding appears once. A sticky section timeline jumps between parts. */
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
  const [report, setReport] = useState(result);
  const [tone, setTone] = useState<RewriteRequest["tone"]>("direct");
  const best = result.platforms.reduce((a, b) => (a.score > b.score ? a : b));
  const [selected, setSelected] = useState(best.id);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedRange, setSelectedRange] = useState<{
    time: number;
    end: number;
  } | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [activeObservation, setActiveObservation] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const clipEnd = useRef<number | null>(null);
  const clipStart = useRef<number | null>(null);
  const live = result.mode === "live";
  const playable = !!videoUrl && !mediaError;
  const { moments, overall } = useMemo(() => collectReview(result), [result]);
  const metricRows = result.platforms.map((p) => metricsOf(p, live));
  const shared = sameMetrics(metricRows) ? metricRows[0] : null;
  const strengths = [
    ...new Set(result.platforms.flatMap((p) => p.strengths ?? [])),
  ];
  const activeMoment =
    selectedRange ?? moments.find((o) => o.id === activeObservation);

  const sections = [
    { id: "summary", label: "Summary" },
    { id: "scores", label: "Platform scores" },
    { id: "moments", label: "Video moments", count: moments.length },
    { id: "opening", label: "Opening (first 5 s)" },
    { id: "changes", label: "What to change", count: overall.length },
    ...(result.posting ? [{ id: "posting", label: "When & where" }] : []),
    ...(result.thumbnails?.items.length
      ? [{ id: "thumbnails", label: "Thumbnails" }]
      : []),
    { id: "copy", label: "Publishing copy" },
  ];
  const [current, setCurrent] = useState("summary");
  useEffect(() => {
    // Highlight the section being read: the one crossing the upper third of the window.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length)
          setCurrent(visible[0].target.id.replace("section-", ""));
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    document
      .querySelectorAll(".report-sections > [id^='section-']")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const motion_ = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth";
  // Sections land just below the sticky chip bar on phones, near the top on desktop
  // (the site-wide scroll padding leaves room for a header this page doesn't pin).
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollPaddingTop;
    const update = () => {
      const nav = document.querySelector<HTMLElement>(".report-nav");
      root.style.scrollPaddingTop = `${
        nav && getComputedStyle(nav).top === "0px" ? nav.offsetHeight + 12 : 24
      }px`;
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      root.style.scrollPaddingTop = previous;
    };
  }, []);
  function jump(id: string) {
    document
      .getElementById(`section-${id}`)
      ?.scrollIntoView({ behavior: motion_(), block: "start" });
    setCurrent(id);
  }
  useEffect(() => {
    if (initialView === "optimizer")
      document.getElementById("section-copy")?.scrollIntoView();
  }, [initialView]);

  function seek(time: number, id?: string) {
    if (!id) {
      clipStart.current = null;
      clipEnd.current = null;
    }
    const target = Math.min(
      time,
      video.current?.duration || result.video.durationSeconds,
    );
    if (video.current) video.current.currentTime = target;
    setCurrentTime(target);
    if (id) setActiveObservation(id);
  }
  // Play only the flagged stretch of the video, then pause at its end.
  function playClip(o: Observation) {
    setSelectedRange(o);
    clipEnd.current = null;
    clipStart.current = o.time;
    seek(o.time, o.id);
    const bounds = video.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight))
      video.current?.scrollIntoView({ behavior: motion_(), block: "center" });
    void video.current
      ?.play()
      .then(() => (clipEnd.current = o.end))
      .catch(() => undefined);
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
  const metricTiles = (rows: [string, number | null][]) =>
    rows.map(([label, value]) => (
      <div className="metric" key={label}>
        <span>{label}</span>
        <strong>
          {value ?? "—"}
          {value !== null && <span>/100</span>}
        </strong>
        {value !== null && (
          <meter min={0} max={100} value={Number(value)} aria-label={label} />
        )}
      </div>
    ));

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
          {live ? (
            <>
              <strong>AI-generated estimates.</strong> Use these as creative
              guidance, not predictions of virality.
            </>
          ) : (
            <>
              <strong>Demo mode.</strong> These are illustrative insights, not
              an AI analysis of your video.
            </>
          )}
        </p>
      </div>
      {result.warnings?.map((warning) => (
        <p className="error-message" role="status" key={warning}>
          {warning}
        </p>
      ))}

      <div className="report-body">
        <nav className="report-nav" aria-label="Report sections">
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#section-${s.id}`}
                  aria-current={current === s.id ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    jump(s.id);
                  }}
                >
                  <span className="report-nav-dot" aria-hidden="true" />
                  {s.label}
                  {!!s.count && <small>{s.count}</small>}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="report-sections">
          <section id="section-summary" aria-labelledby="summary-title">
            <h2 id="summary-title" className="sr-only">
              Summary
            </h2>
            <div className="report-summary">
              <p className="report-verdict">{result.summary}</p>
              <div className="report-facts">
                <div className="report-best">
                  <span>Best fit</span>
                  <strong>
                    <PlatformIcon id={best.id} /> {nameOf(best.id)}
                  </strong>
                  <small>{best.score} / 100</small>
                </div>
                {shared && metricTiles(shared)}
              </div>
            </div>
          </section>

          <section id="section-scores" aria-labelledby="scores-title">
            <div className="section-heading">
              <h2 id="scores-title">Platform scores</h2>
              <span>
                {live
                  ? `${Math.round((best.modelWeight ?? 0.6) * 100)}% our model + ${100 - Math.round((best.modelWeight ?? 0.6) * 100)}% Gemini content review`
                  : "Content-readiness estimates"}
              </span>
            </div>
            <div className="score-grid report-scores">
              {result.platforms.map((p, i) => (
                <article
                  key={p.id}
                  className={`score-card ${best.id === p.id ? "selected" : ""}`}
                >
                  <div className="score-card-heading">
                    <PlatformIcon id={p.id} />
                    <span>{nameOf(p.id)}</span>
                    {best.id === p.id && (
                      <span className="best-label">
                        {live ? "Highest estimate" : "Best fit"}
                      </span>
                    )}
                  </div>
                  <div className="score-number">
                    {p.score}
                    <span>/ 100</span>
                  </div>
                  <div className="score-track">
                    <motion.div
                      initial={false}
                      animate={{ width: `${p.score}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                  <p>{p.assessment}</p>
                  {!shared && (
                    <p className="score-source">
                      {metricRows[i]
                        .map(([label, value]) => `${label} ${value ?? "—"}`)
                        .join(" · ")}
                    </p>
                  )}
                  {live && (
                    <p className="score-source">
                      Model {p.modelScore?.toFixed(0)} ·{" "}
                      {p.contentScore == null
                        ? "Gemini unavailable"
                        : `Gemini ${p.contentScore.toFixed(0)}`}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section id="section-moments" aria-labelledby="moments-title">
            <div className="section-heading">
              <h2 id="moments-title">Video moments</h2>
              <span>
                {moments.length
                  ? `${moments.length} flagged · click one to play it`
                  : "Nothing flagged"}
              </span>
            </div>
            <div className="moments-layout">
              <div className="video-panel">
                <div className="video-screen">
                  {playable ? (
                    <video
                      ref={video}
                      src={videoUrl!}
                      controls
                      playsInline
                      preload="metadata"
                      onError={() => setMediaError(true)}
                      onTimeUpdate={() => {
                        const time = video.current?.currentTime ?? 0;
                        setCurrentTime(time);
                        if (
                          clipEnd.current !== null &&
                          time >= clipEnd.current
                        ) {
                          clipEnd.current = null;
                          clipStart.current = null;
                          video.current?.pause();
                        }
                      }}
                      onSeeking={() => {
                        // A manual seek outside the clip ends clip playback.
                        const time = video.current?.currentTime ?? 0;
                        if (
                          clipStart.current !== null &&
                          clipEnd.current !== null &&
                          (time < clipStart.current - 0.5 ||
                            time > clipEnd.current)
                        ) {
                          clipStart.current = null;
                          clipEnd.current = null;
                        }
                      }}
                      aria-label="Video player"
                    />
                  ) : (
                    <div className="video-unavailable">
                      <FileVideo />
                      <p>Video preview isn’t available.</p>
                    </div>
                  )}
                </div>
                <div className="timeline">
                  <div className="timeline-label">
                    <span>{timecode(currentTime)}</span>
                    <span>{timecode(result.video.durationSeconds)}</span>
                  </div>
                  {activeMoment && (
                    <div
                      className="timeline-selection"
                      aria-hidden="true"
                      style={{
                        left: `${(activeMoment.time / result.video.durationSeconds) * 100}%`,
                        width: `${Math.max(0.5, ((activeMoment.end - activeMoment.time) / result.video.durationSeconds) * 100)}%`,
                      }}
                    />
                  )}
                  <input
                    aria-label="Seek video"
                    type="range"
                    min={0}
                    max={result.video.durationSeconds}
                    step={0.1}
                    value={currentTime}
                    disabled={!playable}
                    onChange={(event) => seek(Number(event.target.value))}
                  />
                  <div className="timeline-observations">
                    {moments.map((o) => (
                      <button
                        key={o.id}
                        title={`${timecode(o.time)} · ${kindLabels[o.kind]}: ${o.title}`}
                        aria-label={`Play ${timecode(o.time)} to ${timecode(o.end)}: ${o.title}`}
                        style={{
                          left: `${Math.min(96, (o.time / result.video.durationSeconds) * 100)}%`,
                        }}
                        onClick={() => playClip(o)}
                        className={`${o.kind} ${activeObservation === o.id ? "selected" : ""}`}
                        aria-pressed={activeObservation === o.id}
                        disabled={!playable}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {moments.length ? (
                <ol className="moment-list">
                  {moments.map((o) => (
                    <li
                      key={o.id}
                      className={activeObservation === o.id ? "active" : ""}
                    >
                      <button
                        className="moment-play"
                        disabled={!playable}
                        onClick={() => playClip(o)}
                        aria-label={`Play ${timecode(o.time)} to ${timecode(o.end)}`}
                      >
                        <Play size={13} /> {timecode(o.time)}–{timecode(o.end)}
                      </button>
                      <div>
                        <strong>
                          <em className={`moment-kind ${o.kind}`}>
                            {kindLabels[o.kind]}
                          </em>
                          {o.title}
                        </strong>
                        <p>{o.detail}</p>
                        {o.fix && (
                          <p className="moment-fix">
                            <ArrowUpRight size={14} /> {o.fix}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="report-empty">
                  No specific moment was flagged. Whole-video edits are in What
                  to change.
                </p>
              )}
            </div>
          </section>

          <section id="section-opening">
            <HookReview
              review={result.hookAnalysis}
              playable={playable}
              reviewed={result.platforms.some((p) => p.geminiUsed)}
              omitEvidence
              onPlay={(start, end, id) =>
                playClip({
                  id,
                  time: start,
                  end,
                  kind: "improve",
                  title: "Opening review",
                  detail: "",
                  fix: "",
                })
              }
            />
          </section>

          <section
            id="section-changes"
            className="report-card"
            aria-labelledby="changes-title"
          >
            <div className="section-heading">
              <h2 id="changes-title">What to change</h2>
              <span>For the whole video</span>
            </div>
            <div className="overall-grid">
              <div>
                <h3>Edits</h3>
                {overall.length ? (
                  <ol className="overall-list">
                    {overall.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="report-empty">
                    Your edits are the flagged moments above.
                  </p>
                )}
              </div>
              {strengths.length > 0 && (
                <div>
                  <h3>What works</h3>
                  <ul className="post-strengths">
                    {strengths.map((text) => (
                      <li key={text}>
                        <Check size={15} /> {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {result.posting && (
            <section id="section-posting">
              <PostingReview result={result} />
            </section>
          )}
          {!!result.thumbnails?.items.length && (
            <section id="section-thumbnails">
              <ThumbnailReview result={result} />
            </section>
          )}
          <section id="section-copy">
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
          </section>
        </div>
      </div>
      <footer className="studio-footer">
        <span>Your creative judgment comes first.</span>
        <span>
          {live ? "AI-generated estimates" : "Illustrative estimates"} · Not a
          guarantee of performance
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
  const reduceMotion = useReducedMotion();
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
                : value.hook
                  ? "Regenerate"
                  : "Generate copy"}
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
          initial={reduceMotion ? false : { opacity: 0.5, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0.5 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          className="suggestion-grid"
        >
          {copy.map(([key, title]) => (
            <article className={`suggestion suggestion-${key}`} key={key}>
              <header>
                <h3>{title}</h3>
                {value[key] && (
                  <CopyButton
                    key={`${selected}-${value[key]}`}
                    text={value[key]}
                    label={`Copy ${title.toLowerCase()}`}
                  />
                )}
              </header>
              <p>
                {value[key] ||
                  "Choose a tone and generate publishing copy from your review."}
              </p>
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
