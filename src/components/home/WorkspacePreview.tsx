"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { MonitorDesktop } from "./MonitorDesktop";
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
  return (
    <div className="workspace-render">
      <Image
        className="workspace-backdrop"
        src="/textures/workspace-room-v3.jpg"
        fill
        priority
        sizes="(max-width: 900px) 1500px, 100vw"
        alt="ViralPilot’s original 3D creator workspace: an oak desk, computer, plants and an alpine window view"
      />
      {enabled && (
        <>
          <SceneBoundary>
            <Scene screenRef={screenRef} />
          </SceneBoundary>
          <div ref={screenRef} className="monitor-overlay">
            <MonitorDesktop />
          </div>
        </>
      )}
    </div>
  );
}
