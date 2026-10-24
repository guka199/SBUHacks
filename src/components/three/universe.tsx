"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox, Line } from "@react-three/drei";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import type { PlatformId } from "@/lib/contracts";

function makeTexture(label: string, main: boolean) {
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = main ? "#e6f36a" : "#292d2b"; ctx.fillRect(0, 0, 768, 1024);
  ctx.fillStyle = main ? "#20271a" : "#f0f1e8";
  ctx.font = "25px sans-serif"; ctx.fillText("VIRALPILOT / CREATIVE STUDIO", 50, 65);
  if (main) {
    ctx.lineWidth = 32; ctx.strokeStyle = "#26341d";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(680, 435, 120 + i * 55, .1, Math.PI * 1.95); ctx.stroke(); }
    ctx.fillStyle = "#e6f36a"; ctx.fillRect(32, 630, 690, 300);
    ctx.fillStyle = "#171b14"; ctx.font = "bold 92px sans-serif";
    ctx.fillText("MAKE", 50, 735); ctx.fillText("SOMETHING.", 50, 835);
  } else {
    ctx.font = "bold 70px sans-serif"; ctx.fillText(label, 48, 280);
    ctx.fillStyle = "#ddeb70"; ctx.fillRect(50, 440, 668, 14); ctx.fillRect(50, 490, 490, 14); ctx.fillRect(50, 540, 580, 14);
    ctx.font = "25px sans-serif"; ctx.fillText("A NEW WAY TO TELL YOUR STORY", 50, 835);
  }
  ctx.font = "23px sans-serif"; ctx.fillText(main ? "ONE IDEA. YOUR WAY." : "FORMAT / HOOK / PACING", 50, 974);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}
function Frame({ position, rotation, main = false, label }: { position: [number, number, number]; rotation: [number, number, number]; main?: boolean; label: string }) {
  const texture = useMemo(() => makeTexture(label, main), [label, main]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={position} rotation={rotation}><RoundedBox args={[2.35, 3.15, .09]} radius={.06} smoothness={3}><meshStandardMaterial color="#454b42" metalness={.6} roughness={.35} /></RoundedBox><mesh position={[0, 0, .052]}><planeGeometry args={[2.27, 3.06]} /><meshBasicMaterial map={texture} /></mesh></group>;
}
function Composition({ platform, paused }: { platform: PlatformId; paused: boolean }) {
  const group = useRef<Group>(null);
  const phase = useRef(0);
  useFrame(({ pointer }, delta) => {
    if (!group.current || paused) return;
    phase.current += Math.min(delta, .05);
    group.current.rotation.y += (pointer.x * .12 - group.current.rotation.y) * .035;
    group.current.rotation.x += (-pointer.y * .06 - group.current.rotation.x) * .035;
    group.current.position.y = Math.sin(phase.current * .65) * .07;
  });
  const orbit = useMemo(() => Array.from({ length: 81 }, (_, i) => { const a = i / 80 * Math.PI * 2; return [Math.cos(a) * 4.4, Math.sin(a) * 1.5, -.7] as [number, number, number]; }), []);
  return <group ref={group}><Line points={orbit} color="#555b4e" lineWidth={1} /><Frame label="REELS" position={[-2.25, -.1, -.7]} rotation={[.07, .38, -.18]} /><Frame label={platform === "youtube" ? "YOUTUBE" : "SHORTS"} position={[2.2, .13, -.7]} rotation={[-.05, -.38, .17]} /><Frame label="CREATE" main position={[0, 0, .6]} rotation={[.02, -.07, -.035]} /><mesh position={[-4.3, -.1, -.7]}><sphereGeometry args={[.065, 12, 12]} /><meshBasicMaterial color="#e6f36a" /></mesh><mesh position={[4.3, .1, -.7]}><sphereGeometry args={[.065, 12, 12]} /><meshBasicMaterial color="#e6f36a" /></mesh></group>;
}
export default function Universe({ platform, paused }: { platform: PlatformId; paused: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", update); return () => document.removeEventListener("visibilitychange", update); }, [setVisible]);
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8], fov: 35 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} frameloop={paused || !visible ? "demand" : "always"}><ambientLight intensity={2} /><directionalLight position={[4, 5, 6]} intensity={3} /><Composition platform={platform} paused={paused} /></Canvas>;
}
