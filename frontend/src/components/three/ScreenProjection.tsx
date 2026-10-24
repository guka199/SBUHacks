"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { Vector3 } from "three";
import { applyProjection } from "@/lib/projection";
import type { ExperienceMotion } from "@/lib/experience";

// A projective CSS transform maps real HTML to the four screen corners.
// This uses the application's React tree, avoiding a second ReactDOM root.
export function ScreenProjection({
  screenRef,
  motionRef,
}: {
  screenRef: RefObject<HTMLDivElement | null>;
  motionRef: RefObject<ExperienceMotion>;
}) {
  const corners = useMemo(
    () =>
      [
        [-1.834545, 2.879281, -0.85716],
        [1.834545, 2.879281, -0.85716],
        [1.834545, 0.823194, -0.677276],
        [-1.834545, 0.823194, -0.677276],
      ].map((p) => new Vector3(...(p as [number, number, number]))),
    [],
  );
  useFrame(({ camera, size }) => {
    const element = screenRef.current;
    if (!element) return;
    const p = corners.map((c) => {
      const v = c.clone().project(camera);
      return {
        x: ((v.x + 1) * size.width) / 2,
        y: ((1 - v.y) * size.height) / 2,
      };
    });
    applyProjection(element, p, size, motionRef.current.progress);
  });
  return null;
}
