"use client";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, Mesh } from "three";
function Plant({
  file,
  position,
  scale,
  rotation = 0,
}: {
  file: string;
  position: [number, number, number];
  scale: number;
  rotation?: number;
}) {
  const { scene } = useGLTF(file);
  const root = useRef<Group>(null);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  useFrame(({ clock }) => {
    if (root.current)
      root.current.rotation.z =
        Math.sin(clock.elapsedTime * 0.42 + position[0]) * 0.003;
  });
  return (
    <group
      ref={root}
      position={position}
      scale={scale}
      rotation={[0, rotation, 0]}
    >
      <primitive object={object} dispose={null} />
    </group>
  );
}
export function RealPlants() {
  return (
    <>
      <Plant
        file="/assets/polyhaven/plant-01.glb"
        position={[-3.0, 0.015, -0.8]}
        scale={1.6}
        rotation={0.7}
      />
      <Plant
        file="/assets/polyhaven/plant-02.glb"
        position={[3.1, 0, -0.6]}
        scale={1.1}
        rotation={-1.1}
      />
      <Plant
        file="/assets/polyhaven/plant-01.glb"
        position={[-4.35, -3.75, -1.5]}
        scale={3.7}
        rotation={2.1}
      />
      <Plant
        file="/assets/polyhaven/plant-02.glb"
        position={[3.8, 3.18, -2.45]}
        scale={0.65}
      />
    </>
  );
}
