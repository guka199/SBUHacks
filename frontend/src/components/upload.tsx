"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Film,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { platforms, type PlatformId } from "@/lib/contracts";
import { API_MODE, analysisApi, delay, waitForAnalysis } from "@/lib/api";
import { makeDemoResult } from "@/lib/demo";
import { readVideo, timecode, validateVideo } from "@/lib/video";
import { useSession } from "./session";
import { PlatformIcon } from "./ui";
import { useAuth } from "@/lib/auth";

const stages = [
  "Preparing your video",
  "Examining the opening hook",
  "Looking at pacing",
  "Comparing platform fit",
  "Preparing recommendations",
];
export function Upload() {
  const session = useSession();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [caption, setCaption] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [selected, setSelected] = useState<PlatformId[]>(
    platforms.map((p) => p.id),
  );
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [example, setExample] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const selection = useRef(0);
  useEffect(
    () => () => {
      controller.current?.abort();
      selection.current++;
    },
    [],
  );
  const demo = API_MODE === "demo" || example;
  async function select(file?: File, isExample = false) {
    if (!file || busy) return;
    const ticket = ++selection.current;
    setError("");
    const problem = validateVideo(file);
    if (problem) {
      setError(problem);
      return;
    }
    setChecking(true);
    try {
      const info = await readVideo(file);
      if (ticket !== selection.current) return;
      session.selectVideo(file, info);
      setExample(isExample);
    } catch (e) {
      if (ticket === selection.current)
        setError(e instanceof Error ? e.message : "Could not open video.");
    } finally {
      if (ticket === selection.current) setChecking(false);
    }
  }
  async function sample() {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/demo.webm");
      if (!response.ok)
        throw new Error(
          "The sample video couldn’t load. Choose a video from your device.",
        );
      await select(
        new File([await response.blob()], "Make something.webm", {
          type: "video/webm",
        }),
        true,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sample.");
    } finally {
      setChecking(false);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (busy || checking) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Choose one video at a time.");
      return;
    }
    void select(event.dataTransfer.files[0]);
  }
  async function analyze() {
    if (!session.file || !session.metadata || !selected.length || busy) return;
    if (!demo && (!user || !caption.trim())) {
      setError(
        !user
          ? "Sign in before analyzing your video."
          : "Add your caption or title.",
      );
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    setProgress(0);
    setUploaded(false);
    session.setResult(null);
    try {
      if (demo) {
        for (let i = 0; i < stages.length; i++) {
          setStage(stages[i]);
          setProgress(i * 20);
          await delay(850, active.signal);
        }
        session.setResult(makeDemoResult(session.metadata, selected));
      } else {
        setStage("Uploading video");
        const job = await analysisApi.create(
          session.file,
          selected,
          (percent) => {
            setProgress(percent);
            if (percent === 100) {
              setUploaded(true);
              setStage(
                "Reviewing your video and comparing platforms… This can take a few minutes.",
              );
            }
          },
          active.signal,
          session.metadata,
          caption,
        );
        const result = await waitForAnalysis(job, active.signal, (value) => {
          setStage(value.stage);
          setProgress(value.progress);
        });
        if (result.mode !== "live")
          throw new Error(
            "The live service returned demo data. Check the backend mode.",
          );
        session.setResult(result);
        router.push(`/analysis/${result.id}`);
      }
      setProgress(100);
      if (demo) router.push("/analysis");
    } catch (e) {
      if (!active.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Something went wrong. Try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="upload-page page-gutter">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} /> Back to home
      </Link>
      <div className="upload-title">
        <h1>
          Let’s find your
          <br />
          video’s direction.
        </h1>
        <p>
          Bring a rough cut or the final edit.
          <br />
          Start with the story you want to tell.
        </p>
      </div>
      <div className="upload-grid">
        <section className="upload-workspace" aria-label="Choose your video">
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mov"
            aria-label="Choose video file"
            disabled={busy || checking}
            onChange={(e) => {
              void select(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {session.videoUrl ? (
            <div className="preview-zone">
              <video
                controls
                playsInline
                preload="metadata"
                src={session.videoUrl}
                aria-label="Selected video preview"
              />
              <div className="file-details">
                <Film size={20} />
                <div>
                  <strong>{session.file?.name}</strong>
                  <span>
                    {session.metadata &&
                      `${timecode(session.metadata.durationSeconds)} · ${session.metadata.width} × ${session.metadata.height}`}{" "}
                    · {((session.file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Remove selected video"
                  disabled={busy}
                  onClick={() => {
                    selection.current++;
                    session.clearVideo();
                    setExample(false);
                    setError("");
                    setChecking(false);
                  }}
                >
                  <X size={19} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`drop-zone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy && !checking) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <div className="upload-glyph">
                <UploadCloud size={34} />
              </div>
              <h2>
                {checking ? "Opening your video…" : "Drop your next big idea."}
              </h2>
              <p>Drag a video here, or choose one from your device.</p>
              <button
                className="button button-light"
                disabled={busy || checking}
                onClick={() => input.current?.click()}
              >
                {checking ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Film size={18} />
                )}{" "}
                Browse files
              </button>
              <span className="file-limits">MP4, WebM, MOV · Up to 200 MB</span>
            </div>
          )}
          <div className="sample-row">
            <span>Just looking around?</span>
            <button
              className="text-link"
              disabled={checking || busy}
              onClick={sample}
            >
              Try our sample video <ArrowUpRight size={17} />
            </button>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </section>
        <aside className="upload-settings">
          <label className="draft-caption">
            <span>Caption or title</span>
            <textarea
              value={caption}
              maxLength={10000}
              rows={4}
              disabled={busy}
              placeholder="What will viewers read with your video?"
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
          {!demo && !loading && !user && (
            <p className="field-note">
              <Link href="/login">Sign in</Link> or{" "}
              <Link href="/signup">create an account</Link> to analyze and save
              your video.
            </p>
          )}
          <h2>Where’s it going?</h2>
          <p>Choose the platforms you’d like to explore.</p>
          <fieldset className="platform-checks">
            <legend className="sr-only">Target platforms</legend>
            {platforms.map((p) => (
              <label
                key={p.id}
                className={selected.includes(p.id) ? "checked" : ""}
              >
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    setSelected((prev) =>
                      prev.includes(p.id)
                        ? prev.filter((id) => id !== p.id)
                        : [...prev, p.id],
                    )
                  }
                />
                <PlatformIcon id={p.id} />
                <span>{p.name}</span>
                <span className="format-label">{p.format}</span>
                <span className="checkbox-mark">
                  {selected.includes(p.id) && <Check size={14} />}
                </span>
              </label>
            ))}
          </fieldset>
          {!demo &&
            selected.includes("youtube") &&
            selected.includes("shorts") && (
              <p className="field-note">
                YouTube and Shorts share a reach model. Gemini reviews the two
                formats separately.
              </p>
            )}
          <div className="mode-note">
            <span className="status-dot" />
            <div>
              <strong>{demo ? "You’re in demo mode" : "Live analysis"}</strong>
              <p>
                {demo
                  ? "Your video stays in this browser. Results are sample insights, not an analysis of your file."
                  : "Your video will be sent to the configured analysis service when you continue."}
              </p>
            </div>
          </div>
          {busy ? (
            <div className="analysis-progress" aria-live="polite">
              <span>{demo ? "Demo walkthrough" : "Analysis in progress"}</span>
              <h3>{stage}</h3>
              <progress
                value={!demo && uploaded ? undefined : progress}
                max={100}
                aria-label={demo ? "Demo progress" : "Analysis progress"}
              />
              <div>
                <span>
                  {!demo && uploaded ? "Video uploaded" : `${progress}%`}
                </span>
                <button
                  className="text-link"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button-accent full-width"
              disabled={
                !session.file ||
                !selected.length ||
                checking ||
                (!demo && (loading || !user || !caption.trim()))
              }
              onClick={analyze}
            >
              {demo ? "Explore sample analysis" : "Analyze my video"}
              <ArrowUpRight size={21} />
            </button>
          )}
          {!selected.length && (
            <p role="status" className="field-note">
              Choose at least one platform.
            </p>
          )}
          <p className="privacy-note">
            {demo
              ? "Demo files stay in this browser and clear when you leave."
              : "Your report and video are saved privately to your account. Gemini reviews the uploaded video."}
          </p>
        </aside>
      </div>
      <div className="upload-footer">
        <span>Keep your voice. Find your audience.</span>
        <span>ViralPilot / Creative studio</span>
      </div>
    </div>
  );
}
