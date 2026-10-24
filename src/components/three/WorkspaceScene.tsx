"use client";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Suspense, useEffect, useRef, type RefObject } from "react";
import { initialMotion, type ExperienceMotion } from "@/lib/experience";
import { RealPlants } from "./RealPlants";
import { WorkspaceModel } from "./WorkspaceModel";
import { SceneLighting } from "./SceneLighting";

import { WindowLandscape } from "./WindowLandscape";
import { ScreenProjection } from "./ScreenProjection";
import { ProfessionalHardware } from "./ProfessionalHardware";
import { CinematicPost } from "./CinematicPost";
import { AgXToneMapping, Vector3 } from "three";
import { DeskLamp } from "./DeskLamp";

function CameraRig({ motionRef }: { motionRef: RefObject<ExperienceMotion> }) {
  const { camera, invalidate, size } = useThree();
  const position = useRef(new Vector3());
  const aim = useRef(new Vector3());
  const targetAim = useRef(new Vector3());
  useEffect(() => {
    const motion = motionRef.current;
    motion.invalidate = invalidate;
    camera.position.set(motion.x, motion.y, motion.z);
    camera.lookAt(motion.targetX, motion.targetY, motion.targetZ);
    aim.current.set(motion.targetX, motion.targetY, motion.targetZ);
    camera.updateProjectionMatrix();
    invalidate();
    return () => {
      delete motion.invalidate;
    };
  }, [camera, invalidate, size, motionRef]);
  useFrame((_, delta) => {
    const motion = motionRef.current;
    const blend = 1 - Math.exp(-20 * Math.min(delta, 0.05));
    camera.position.lerp(
      position.current.set(motion.x, motion.y, motion.z),
      blend,
    );
    aim.current.lerp(
      targetAim.current.set(motion.targetX, motion.targetY, motion.targetZ),
      blend,
    );
    camera.lookAt(aim.current);
    camera.updateMatrixWorld();
  });
  return null;
}
export default function WorkspaceScene({
  screenRef,
  motionRef,
  active = true,
}: {
  screenRef: RefObject<HTMLDivElement | null>;
  motionRef?: RefObject<ExperienceMotion>;
  active?: boolean;
}) {
  const fallback = useRef(initialMotion());
  const movement = motionRef ?? fallback;
  return (
    <Canvas
      className="workspace-canvas"
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [2.5, 3, 10], fov: 44, near: 0.1, far: 45 }}
      frameloop={active ? "always" : "demand"}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = AgXToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <color attach="background" args={["#e9e6da"]} />
      <Suspense fallback={null}>
        <CameraRig motionRef={movement} />
        <SceneLighting />
        <WindowLandscape />

        <WorkspaceModel name="room" />
        <WorkspaceModel name="desk" />
        <ProfessionalHardware />
        <RealPlants />
        <DeskLamp />
        <ScreenProjection screenRef={screenRef} motionRef={movement} />
        <ContactShadows
          position={[0, -3.78, 0]}
          opacity={0.38}
          scale={17}
          blur={2.4}
          far={4}
          resolution={512}
          frames={1}
          color="#4a3b22"
        />
        <ContactShadows
          position={[0, 0.034, 0.2]}
          opacity={0.3}
          scale={8.1}
          blur={1.8}
          far={3.2}
          resolution={1024}
          frames={1}
          color="#3a2e20"
        />
        <CinematicPost />
      </Suspense>
    </Canvas>
  );
}
