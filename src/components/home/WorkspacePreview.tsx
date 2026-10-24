"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { MonitorExperience } from "./MonitorExperience";
import { createMonitorLoop } from "./monitor-loop";
import { gsap } from "gsap";
const Scene = dynamic(() => import("../three/WorkspaceScene"), { ssr: false });
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="workspace-unavailable">A little space to create.</div>
    ) : (
      this.props.children
    );
  }
}
export function WorkspacePreview() {
  const [enabled, setEnabled] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
    );
    const update = () => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      setEnabled(
        media.matches && !!gl && process.env.NEXT_PUBLIC_ENABLE_3D !== "false",
      );
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!enabled || !screenRef.current) return;
    const context = gsap.context(() => {
      gsap.set(".product-demonstration,.liquid-field,.monitor-application", {
        autoAlpha: 0,
      });
      createMonitorLoop(screenRef.current!).time(0).pause();
    }, screenRef.current);
    return () => context.revert();
  }, [enabled]);
  return (
    <div className="workspace-render">
      <Image
        className="workspace-backdrop"
        src="/textures/workspace-room-v7.jpg"
        fill
        priority
        sizes="(max-width: 900px) 1500px, 100vw"
        alt="Modern creator studio with detailed licensed hardware and red accents"
      />
      {enabled && (
        <>
          <SceneBoundary>
            <Scene screenRef={screenRef} />
          </SceneBoundary>
          <div ref={screenRef} className="monitor-overlay">
            <MonitorExperience />
          </div>
        </>
      )}
    </div>
  );
}
