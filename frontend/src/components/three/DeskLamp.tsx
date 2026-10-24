"use client";
import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Mesh } from "three";
export function DeskLamp() {
  const { scene } = useGLTF("/assets/polyhaven/desk-lamp.glb");
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return (
    <primitive
      object={model}
      position={[-3.65, 0, -0.65]}
      scale={2.9}
      rotation={[0, -Math.PI / 2, 0]}
      dispose={null}
    />
  );
}
