"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowLeft,
  ChartNoAxesCombined,
  Check,
  Film,
  LayoutDashboard,
  Loader2,
  ScanLine,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Mark, PlatformIcon } from "../ui";
import { platforms } from "@/lib/contracts";
import { useSession } from "../session";
import { readVideo, validateVideo } from "@/lib/video";
export function StudioGateway({
  embedded = false,
  onBack,
}: {
  embedded?: boolean;
  onBack?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    router = useRouter(),
    session = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function choose(file?: File) {
    if (!file || busy) return;
    setError("");
    const problem = validateVideo(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      session.selectVideo(file, await readVideo(file));
      router.push("/analyze");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open video.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`gateway ${embedded ? "gateway-embedded" : ""}`}>
      <aside className="gateway-rail">
        <Link className="gateway-brand" href="/studio">
          <Mark />
          viralpilot
        </Link>
        <div className="gateway-workspace">
          <span>S</span>
          <div>
            <strong>Creator studio</strong>
            <small>Your ideas live here</small>
          </div>
        </div>
        <nav aria-label="Studio navigation">
          <Link className="active" href="/studio">
            <LayoutDashboard size={16} />
            Overview
          </Link>
          <Link href="/analyze">
            <UploadCloud size={16} />
            Analyze a video
          </Link>
          <Link href="/demo">
            <ChartNoAxesCombined size={16} />
            Example insights
          </Link>
          <Link href="/analysis/demo/optimize">
            <Sparkles size={16} />
            Content optimizer
          </Link>
        </nav>
        <div className="gateway-rail-note">
          <span className="natural-dot" />
          One video. Every platform.
          <p>
            A little less noise.
            <br />A lot more possibility.
          </p>
        </div>
      </aside>
      <div className="gateway-main">
        <header>
          {onBack ? (
            <button className="gateway-back" onClick={onBack}>
              <ArrowLeft size={14} /> Back to the room
            </button>
          ) : (
            <span>Your creative space</span>
          )}
          <Link href="/analyze">
            New analysis <ArrowUpRight size={14} />
          </Link>
        </header>
        <div className="gateway-intro">
          <div>
            <h2>
              A clearer view
              <br />
              <em>of your next idea.</em>
            </h2>
            <p>
              See what’s working. Find what to change.
              <br />
              Keep creating in your own voice.
            </p>
          </div>
          <span className="gateway-seal">
            <ScanLine size={30} />
            <span>
              Make every
              <br />
              frame count.
            </span>
          </span>
        </div>
        <div className="gateway-grid">
          <section
            className="gateway-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length !== 1) {
                setError("Choose one video at a time.");
                return;
              }
              void choose(e.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={26} />
            <h3>Your next video starts here.</h3>
            <p>Drop in a draft. Let’s find its direction.</p>
            <input
              ref={input}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mov"
              className="sr-only"
              aria-label="Choose video for studio"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            <button
              className="natural-button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Film size={15} />
              )}
              Choose a video
              <ArrowUpRight size={14} />
            </button>
            <small>MP4, WebM, MOV · Up to 250 MB</small>
            {error && (
              <p role="alert" className="gateway-error">
                {error}
              </p>
            )}
          </section>
          <section className="gateway-platforms">
            <h3>One story. Four possibilities.</h3>
            <p>Find the right fit for what you made.</p>
            {platforms.map((p) => (
              <Link key={p.id} href="/demo">
                <PlatformIcon id={p.id} size={17} />
                <span>{p.name}</span>
                <small>{p.format}</small>
                <Check size={13} />
              </Link>
            ))}
          </section>
        </div>
        <div className="gateway-bottom">
          <span>
            <span className="natural-dot" /> Demo mode · Example insights are
            clearly labeled
          </span>
          <Link href="/demo">
            Take a look around <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
