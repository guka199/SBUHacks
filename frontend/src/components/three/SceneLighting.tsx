"use client";
import { Environment } from "@react-three/drei";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
RectAreaLightUniformsLib.init();
export function SceneLighting() {
  return (
    <>
      <hemisphereLight args={["#f6f8ff", "#757579", 0.5]} />
      <directionalLight
        position={[-3, 6, -2.3]}
        color="#fff9eb"
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-normalBias={0.008}
        shadow-bias={-0.0001}
      />
      <rectAreaLight
        position={[0, 4, -2.8]}
        rotation={[0, Math.PI, 0]}
        width={7}
        height={4}
        color="#edf4ff"
        intensity={2.6}
      />
      <Environment
        files="/assets/polyhaven/sunlit-loft.hdr"
        background={false}
        environmentIntensity={0.7}
        environmentRotation={[0, 1.1, 0]}
      />
    </>
  );
}
