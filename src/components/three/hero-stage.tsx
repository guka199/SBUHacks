"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Pause, Play, ScanLine } from "lucide-react";
import type { PlatformId } from "@/lib/contracts";
const Universe = dynamic(() => import("./universe"), { ssr: false, loading: () => <Fallback /> });
function Fallback() { return <div className="hero-fallback"><div className="fallback-card back" /><div className="fallback-card"><span>ViralPilot / creative studio</span><strong>GOOD IDEAS<br />DESERVE<br />AN AUDIENCE.</strong><Play size={38} fill="currentColor" /><span>Your next story starts with a frame.</span></div></div>; }
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}
export function HeroStage({ platform }: { platform: PlatformId }) {
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const update = () => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      const available = !!gl; gl?.getExtension("WEBGL_lose_context")?.loseContext();
      setEnabled(media.matches && available && process.env.NEXT_PUBLIC_ENABLE_3D !== "false");
    };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return <div className="hero-stage">
    <div className="stage-label"><ScanLine size={17} /><span>One video. Four possibilities.</span></div>
    <div className="scene" aria-hidden="true">{enabled ? <SceneBoundary><Universe platform={platform} paused={paused} /></SceneBoundary> : <Fallback />}</div>
    <div className="stage-tag tag-left"><span className="tag-dot" />Hook. Pacing. Possibility.</div><div className="stage-tag tag-right">Made to be seen.<span className="tag-plus">+</span></div>
    {enabled && <button className="scene-toggle" onClick={() => setPaused(!paused)} aria-label={paused ? "Play 3D motion" : "Pause 3D motion"}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? "Play motion" : "Pause motion"}</button>}
    <span className="stage-footnote">Interactive concept visualization</span>
  </div>;
}
