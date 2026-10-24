"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Play,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initialMotion, storyStages } from "@/lib/experience";
import { applyProjection } from "@/lib/projection";
import { MonitorExperience } from "./MonitorExperience";
import { choreograph } from "./choreography";
import { StudioGateway } from "./StudioGateway";
const Scene = dynamic(() => import("../three/WorkspaceScene"), { ssr: false });
class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function ScrollExperience() {
  const root = useRef<HTMLElement>(null),
    stage = useRef<HTMLDivElement>(null),
    screen = useRef<HTMLDivElement>(null);
  const motion = useRef(initialMotion()),
    timeline = useRef<gsap.core.Timeline | null>(null),
    stageIndex = useRef(0);
  const [mode, setMode] = useState<"pending" | "webgl" | "flat" | "reduced">(
      "pending",
    ),
    [active, setActive] = useState(0),
    [visible, setVisible] = useState(true);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 900px)"),
      reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (reduce.matches) {
        setMode("reduced");
        return;
      }
      if (!desktop.matches || process.env.NEXT_PUBLIC_ENABLE_3D === "false") {
        setMode("flat");
        return;
      }
      const canvas = document.createElement("canvas"),
        gl = canvas.getContext("webgl2");
      setMode(gl ? "webgl" : "flat");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
    update();
    desktop.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (
      mode === "pending" ||
      mode === "reduced" ||
      !root.current ||
      !stage.current
    )
      return;
    gsap.registerPlugin(ScrollTrigger);
    const scope = root.current,
      element = stage.current,
      s = motion.current;
    Object.assign(s, initialMotion());
    const context = gsap.context(() => {
      const q = gsap.utils.selector(scope),
        windows = q(".chaos-window"),
        notes = q(".chaos-notification"),
        tabs = q(".browser-extra-tab");
      gsap.set([...windows, ...notes, ...tabs], { autoAlpha: 0 });
      gsap.set(".liquid-field,.monitor-application", { autoAlpha: 0 });
      gsap.set(".story-caption:not(.caption-opening)", { autoAlpha: 0 });
      const update = () => {
        scope.dataset.progress = s.progress.toFixed(4);
        s.invalidate?.();
        const next = storyStages.reduce(
          (value, item, index) =>
            s.progress >= item.at - 0.025 ? index : value,
          0,
        );
        if (next !== stageIndex.current) {
          stageIndex.current = next;
          setActive(next);
        }
        if (mode === "flat" && screen.current) {
          const w = element.clientWidth,
            h = element.clientHeight,
            p = Math.min(1, s.progress / 0.45),
            startTop = h * 0.48,
            endTop = h * (w < 600 ? 0.36 : 0.3);
          const top = startTop + (endTop - startTop) * p;
          applyProjection(
            screen.current,
            [
              { x: 16, y: top },
              { x: w - 16, y: top },
              { x: w - 16, y: top + (w - 32) * 0.5625 },
              { x: 16, y: top + (w - 32) * 0.5625 },
            ],
            { width: w, height: h },
            s.progress,
          );
        }
      };
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          id: "creator-chaos",
          trigger: scope,
          pin: element,
          start: "top top",
          end: () => `+=${innerHeight * (mode === "flat" ? 3 : 4.2)}`,
          scrub: 0.32,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: update,
        },
        onUpdate: update,
      });
      timeline.current = tl;
      choreograph(tl, s, scope, mode);
      update();
      document.fonts.ready.then(() => {
        if (timeline.current === tl) ScrollTrigger.refresh();
      });
    }, scope);
    return () => {
      context.revert();
      timeline.current = null;
    };
  }, [mode]);
  function jump(progress: number) {
    const trigger = timeline.current?.scrollTrigger;
    if (trigger) {
      // Release focus from the screen before it becomes inert on the return trip.
      if (screen.current?.contains(document.activeElement))
        root.current?.focus({ preventScroll: true });
      window.scrollTo({
        top: trigger.start + (trigger.end - trigger.start) * progress,
        behavior: "instant",
      });
    }
  }
  return (
    <>
      <section
        ref={root}
        className={`experience-story mode-${mode}`}
        data-progress="0"
        tabIndex={-1}
      >
        <div ref={stage} className="experience-stage">
          <Image
            className="experience-poster"
            src="/textures/workspace-room-v3.jpg"
            alt="A cozy creator workspace with a large monitor, oak desk and mountain view"
            fill
            priority
            sizes="(max-width: 900px) 1500px, 100vw"
          />
          {mode === "webgl" && (
            <SceneBoundary onFailure={() => setMode("flat")}>
              <Scene screenRef={screen} motionRef={motion} active={visible} />
            </SceneBoundary>
          )}
          {(mode === "webgl" || mode === "flat") && (
            <div
              ref={screen}
              className="monitor-overlay"
              inert
              aria-hidden="true"
            >
              <MonitorExperience onBack={() => jump(0)} />
            </div>
          )}
          <div className="story-caption caption-opening">
            <h1>
              Your content is
              <br />
              <em>everywhere.</em>
            </h1>
            <p>
              Creating is hard enough.
              <br className="mobile-break" /> Managing every platform shouldn’t
              be.
            </p>
            <div className="workspace-actions">
              <Link className="natural-button" href="/analyze">
                Analyze your video <ArrowUpRight size={17} />
              </Link>
              {mode === "reduced" ? (
                <Link className="natural-demo" href="/studio">
                  Enter the studio <ArrowUpRight size={14} />
                </Link>
              ) : (
                <button className="natural-demo" onClick={() => jump(0.27)}>
                  <Play size={12} fill="currentColor" />
                  Watch the story
                </button>
              )}
            </div>
          </div>
          <div className="story-caption caption-tools">
            <h2>
              One video. <em>Three dashboards.</em>
            </h2>
          </div>
          <div className="story-caption caption-overload">
            <h2>
              More tabs. <em>Less headspace.</em>
            </h2>
          </div>
          {mode !== "reduced" && (
            <>
              <button
                className="experience-scroll"
                onClick={() =>
                  jump(Math.min(1, storyStages[Math.min(active + 1, 6)].at))
                }
              >
                <span>Scroll to find your clarity</span>
                <ArrowDown size={16} />
              </button>
              <div
                className="experience-controls"
                aria-label="Cinematic story controls"
              >
                <button
                  aria-label="Previous story stage"
                  disabled={active === 0}
                  onClick={() => jump(storyStages[Math.max(0, active - 1)].at)}
                >
                  <ArrowLeft size={14} />
                </button>
                <div>
                  <span>{storyStages[active].name}</span>
                  <div className="experience-dots">
                    {storyStages.map((item, i) => (
                      <button
                        className={i === active ? "active" : ""}
                        key={item.at}
                        aria-label={`Story: ${item.detail}`}
                        aria-current={i === active ? "step" : undefined}
                        onClick={() => jump(item.at)}
                      />
                    ))}
                  </div>
                </div>
                <button
                  aria-label="Next story stage"
                  onClick={() => jump(storyStages[Math.min(6, active + 1)].at)}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
              <button className="skip-experience" onClick={() => jump(1)}>
                Skip intro <ArrowUpRight size={13} />
              </button>
            </>
          )}
          {mode === "reduced" && (
            <div className="reduced-note">
              A calmer view, with reduced motion.{" "}
              <Link href="/studio">
                Enter the studio <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </section>
      {mode === "reduced" && <StudioGateway />}
      <section className="natural-story" id="story">
        <div>
          <h2>
            Every platform.
            <br />
            <em>One clear direction.</em>
          </h2>
        </div>
        <div>
          <p>
            Find your video’s strongest fit, explore the moments that matter,
            and sharpen your next edit. More perspective. Less switching between
            tools.
          </p>
          <Link className="natural-button" href="/analyze">
            Bring your next idea <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <footer className="natural-footer">
        <span>ViralPilot · Made for creators. Built at SBUHacks.</span>
        <span>
          <Link href="/credits">Scene artists &amp; licenses</Link> · Link
          interaction by <a href="https://skiper-ui.com/">Skiper UI</a>
        </span>
      </footer>
    </>
  );
}
