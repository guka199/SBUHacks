"use client";
import { useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import {
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  DataTexture,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from "three";

export function WorkspaceModel({ name }: { name: "desk" | "room" }) {
  const { scene } = useGLTF(`/models/${name}.glb`);
  const [colorSource, normalSource, roughnessSource] = useTexture([
    "/assets/polyhaven/oak-color.jpg",
    "/assets/polyhaven/oak-normal.jpg",
    "/assets/polyhaven/oak-roughness.jpg",
  ]);
  const { object, materials, textures } = useMemo(() => {
    const object = scene.clone(true);
    const color = colorSource.clone(),
      normal = normalSource.clone(),
      roughness = roughnessSource.clone();
    color.colorSpace = SRGBColorSpace;
    [color, normal, roughness].forEach((texture) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(2, 1);
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    });
    const materials: MeshStandardMaterial[] = [];
    const weave = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++)
        weave[y * 64 + x] = 110 + (x % 4 < 2 !== y % 4 < 2 ? 32 : 0);
    const fabricTexture = new DataTexture(weave, 64, 64, RedFormat);
    fabricTexture.wrapS = fabricTexture.wrapT = RepeatWrapping;
    fabricTexture.repeat.set(24, 10);
    fabricTexture.needsUpdate = true;
    const oakMaterial = new MeshStandardMaterial({
      color: "#d8dfe0",
      map: color,
      normalMap: normal,
      normalScale: new Vector2(0.3, 0.3),
      roughnessMap: roughness,
      roughness: 0.78,
    });
    materials.push(oakMaterial);
    object.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material.name === "Oak") node.material = oakMaterial;
        if (
          node.name === "WoolDeskMat" ||
          node.name.startsWith("LinenCurtain")
        ) {
          const fabric = new MeshPhysicalMaterial({
            color: node.name === "WoolDeskMat" ? "#171717" : "#F8EBAB",
            roughness: 0.96,
            sheen: 0.6,
            sheenColor: "#b9b9b9",
            sheenRoughness: 0.9,
            bumpMap: fabricTexture,
            bumpScale: 0.004,
          });
          materials.push(fabric);
          node.material = fabric;
        }
      }
    });
    return {
      object,
      materials,
      textures: [color, normal, roughness, fabricTexture],
    };
  }, [scene, colorSource, normalSource, roughnessSource]);
  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
    [materials, textures],
  );
  return <primitive object={object} dispose={null} />;
}
