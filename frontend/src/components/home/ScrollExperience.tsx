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
  Pause,
  Play,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initialMotion, storyStages } from "@/lib/experience";
import { applyProjection } from "@/lib/projection";
import { flatScreenLayout } from "@/lib/fallback-layout";
import { MonitorExperience } from "./MonitorExperience";
import { choreograph } from "./choreography";
import { createMonitorLoop } from "./monitor-loop";
import { StudioGateway } from "./StudioGateway";
const Scene = dynamic(() => import("../three/WorkspaceScene"), { ssr: false });
function measureOpeningFloor(scope: HTMLElement) {
  const caption = scope.querySelector<HTMLElement>(".caption-opening");
  const actions = scope.querySelector<HTMLElement>(".workspace-actions");
  return caption && actions
    ? caption.offsetTop + actions.offsetTop + actions.offsetHeight + 18
    : 392;
}
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
  const poster = useRef<HTMLImageElement>(null);
  const root = useRef<HTMLElement>(null),
    stage = useRef<HTMLDivElement>(null),
    screen = useRef<HTMLDivElement>(null);
  const motion = useRef(initialMotion()),
    timeline = useRef<gsap.core.Timeline | null>(null),
    loop = useRef<gsap.core.Timeline | null>(null),
    stageIndex = useRef(0);
  const [mode, setMode] = useState<"pending" | "webgl" | "flat" | "reduced">(
      "pending",
    ),
    [active, setActive] = useState(0),
    [visible, setVisible] = useState(true),
    [paused, setPaused] = useState(false);
  const preference = useRef({ paused: false, visible: true, hidden: false });
  useEffect(() => {
    if (mode !== "webgl" && mode !== "flat") return;
    const scope = root.current,
      element = stage.current;
    const application = scope?.querySelector<HTMLElement>(
      ".monitor-application",
    );
    if (!scope || !element || !application) return;
    // The pin retains its viewport height. Reserve the rest of the report in
    // document flow, so the page can scroll through it after the pin releases.
    const measure = () => {
      const extra = Math.max(
        0,
        application.offsetHeight - element.clientHeight,
      );
      scope.style.setProperty("--report-overflow", `${extra}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(application);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      scope.style.removeProperty("--report-overflow");
      delete element.dataset.applicationEntered;
    };
  }, [mode]);
  useEffect(() => {
    if (
      mode !== "reduced" ||
      !root.current ||
      !stage.current ||
      !poster.current
    )
      return;
    const element = stage.current,
      image = poster.current,
      scope = root.current;
    let disposed = false;
    const fit = () => {
      if (disposed || !scope.isConnected) return;
      const frame = flatScreenLayout(
        element.clientWidth,
        element.clientHeight,
        0,
        measureOpeningFloor(scope),
      ).poster;
      Object.assign(image.style, {
        width: frame.width + "px",
        height: frame.height + "px",
        left: frame.left + "px",
        top: frame.top + "px",
        right: "auto",
        bottom: "auto",
        objectFit: "fill",
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    document.fonts.ready.then(() => {
      if (!disposed && poster.current === image) fit();
    });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [mode]);
  useEffect(() => {
    const desktop = matchMedia("(min-width:900px)"),
      reduce = matchMedia("(prefers-reduced-motion:reduce)");
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
    const observer = new IntersectionObserver(([e]) =>
      setVisible(e.isIntersecting),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    preference.current.paused = paused;
    preference.current.visible = visible;
    const sync = () => {
      preference.current.hidden = document.hidden;
      loop.current?.paused(
        paused || !visible || document.hidden || motion.current.progress > 0.15,
      );
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [paused, visible]);
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
      gsap.set(".chaos-window", {
        autoAlpha: 1,
        transformOrigin: "480px 270px",
      });
      gsap.set(
        ".liquid-field,.monitor-application,.product-demonstration,.product-scene,.caption-meet-product",
        { autoAlpha: 0 },
      );
      const auto = createMonitorLoop(scope);
      loop.current = auto;
      let openingFloor = measureOpeningFloor(scope);
      const update = () => {
        scope.dataset.progress = s.progress.toFixed(4);
        element.dataset.applicationEntered = String(s.progress >= 1 - 1e-6);
        s.invalidate?.();
        const next = storyStages.reduce(
          (n, item, i) => (s.progress >= item.at - 0.015 ? i : n),
          0,
        );
        if (next !== stageIndex.current) {
          stageIndex.current = next;
          setActive(next);
        }
        const p = preference.current;
        auto.paused(p.paused || !p.visible || p.hidden || s.progress > 0.15);
        if (mode === "flat" && screen.current) {
          const w = element.clientWidth,
            h = element.clientHeight;
          const fit = flatScreenLayout(w, h, s.progress, openingFloor);
          if (poster.current) {
            Object.assign(poster.current.style, {
              width: fit.poster.width + "px",
              height: fit.poster.height + "px",
              left: fit.poster.left + "px",
              top: fit.poster.top + "px",
              right: "auto",
              bottom: "auto",
              objectFit: "fill",
            });
          }
          applyProjection(
            screen.current,
            fit.quad,
            { width: w, height: h },
            s.progress,
            fit.logical,
          );
        }
      };
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          id: "viralpilot-product-story",
          trigger: scope,
          pin: element,
          start: "top top",
          end: () => `+=${innerHeight * (mode === "flat" ? 5 : 6)}`,
          scrub: 0.55,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: () => {
            openingFloor = measureOpeningFloor(scope);
            update();
          },
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
      loop.current = null;
    };
  }, [mode]);
  function jump(progress: number) {
    const trigger = timeline.current?.scrollTrigger;
    if (trigger) {
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
            ref={poster}
            className="experience-poster"
            src="/textures/workspace-room-v7.jpg"
            alt="Modern creator studio with a premium monitor, red keyboard, textured desk and bright architectural surroundings"
            fill
            priority
            sizes="(max-width:900px) 1400px,100vw"
          />
          {mode === "webgl" && (
            <SceneBoundary onFailure={() => setMode("flat")}>
              <Scene
                screenRef={screen}
                motionRef={motion}
                active={visible && active < 5}
              />
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
          <div className="hero-wash" />
          <div className="story-caption caption-opening">
            <p className="hero-kicker">YOUR CONTENT HAS PLACES TO GO.</p>
            <h1>
              One video.
              <br />
              <span>Too many</span>
              <br />
              platforms.
            </h1>
            <p className="hero-description">
              You make the content.
              <br />
              We help you make the next move.
            </p>
            <div className="workspace-actions">
              <Link className="natural-button" href="/analyze">
                Try your video <ArrowUpRight size={19} />
              </Link>
              <Link className="natural-demo" href="/demo">
                Explore the demo <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
          <div className="story-caption caption-meet-product">
            <p>LESS SWITCHING. MORE CREATING.</p>
            <h2>
              Meet <span>ViralPilot.</span>
            </h2>
          </div>
          {mode !== "reduced" && (
            <>
              <button
                className="hero-loop-control"
                aria-label={
                  paused ? "Play monitor animation" : "Pause monitor animation"
                }
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
              >
                <span className={paused ? "" : "live-indicator"} />
                <span>CREATOR DESKTOP / {paused ? "PAUSED" : "LIVE"}</span>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button
                className="experience-scroll"
                onClick={() => jump(storyStages[Math.min(active + 1, 5)].at)}
              >
                See what happens next <ArrowDown size={18} />
              </button>
              <div
                className="experience-controls"
                aria-label="Product story controls"
              >
                <button
                  aria-label="Previous story scene"
                  disabled={active === 0}
                  onClick={() => jump(storyStages[Math.max(0, active - 1)].at)}
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <span>
                    {String(active + 1).padStart(2, "0")} /{" "}
                    {storyStages[active].name}
                  </span>
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
                  aria-label="Next story scene"
                  onClick={() => jump(storyStages[Math.min(5, active + 1)].at)}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
              <button className="skip-experience" onClick={() => jump(1)}>
                Open the dashboard <ArrowUpRight size={14} />
              </button>
            </>
          )}
          {mode === "reduced" && (
            <div className="reduced-note">
              Motion is reduced. The tools are ready.{" "}
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
          <p>FROM FIRST FRAME TO FINAL CAPTION.</p>
          <h2>
            Make every
            <br />
            <span>post count.</span>
          </h2>
        </div>
        <div>
          <p>
            Understand your video. Find its strongest platform. Make a sharper
            edit. All in one creative workspace.
          </p>
          <Link className="natural-button" href="/analyze">
            Bring your next idea <ArrowUpRight size={18} />
          </Link>
          <Link className="footer-demo-link" href="/demo">
            Explore an illustrative report
          </Link>
        </div>
      </section>
      <footer className="natural-footer">
        <span>ViralPilot® · Built for creators. Made at SBUHacks.</span>
        <span>
          <Link href="/credits">Scene artists &amp; licenses</Link> · Link
          interaction by <a href="https://skiper-ui.com/">Skiper UI</a>
        </span>
      </footer>
    </>
  );
}
