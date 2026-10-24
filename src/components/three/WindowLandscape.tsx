"use client";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { useEffect, useMemo } from "react";
export function WindowLandscape() {
  const source = useTexture("/textures/alpine-valley.png");
  const texture = useMemo(() => {
    const copy = source.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.needsUpdate = true;
    return copy;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 3.15, -4.1]}>
      <planeGeometry args={[17, 9.6]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
