"use client";
import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";

export function ProfessionalHardware() {
  const [monitor, desk, keyboard, headphones, mouse] = useGLTF([
    "/assets/hardware/monitor-27.glb",
    "/assets/hardware/rivet-desk.glb",
    "/assets/hardware/keyboard.glb",
    "/assets/hardware/headphones.glb",
    "/assets/hardware/mouse.glb",
  ]);
  const models = useMemo(
    () =>
      [monitor, desk, keyboard, headphones, mouse].map((gltf) => {
        const clone = gltf.scene.clone(true);
        clone.traverse((node) => {
          if (node instanceof Mesh) {
            node.castShadow = true;
            node.receiveShadow = false;
            if (node.name === "Printed key legends") node.castShadow = false;
            const materials = Array.isArray(node.material)
              ? node.material
              : [node.material];
            materials.forEach((material) => {
              if (material instanceof MeshStandardMaterial) {
                if (material.name === "Stand anodised aluminium") {
                  material.color.set("#8c938d");
                  material.metalness = 0.85;
                  material.roughness = 0.48;
                  material.envMapIntensity = 0.5;
                }
                for (const texture of [
                  material.map,
                  material.normalMap,
                  material.roughnessMap,
                ])
                  if (texture) texture.anisotropy = 8;
              }
            });
          }
        });
        return clone;
      }),
    [monitor, desk, keyboard, headphones, mouse],
  );
  const deskPose = useMemo(() => {
    const bounds = new Box3().setFromObject(models[1]),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = 7.8 / size.x;
    return {
      scale,
      position: [
        -center.x * scale,
        0.025 - bounds.max.y * scale,
        0.25 - center.z * scale,
      ] as [number, number, number],
    };
  }, [models]);
  return (
    <>
      <primitive
        object={models[0]}
        position={[0, 0.02, -0.92]}
        scale={6.15}
        dispose={null}
      />
      <primitive object={models[1]} {...deskPose} dispose={null} />
      <primitive
        object={models[2]}
        position={[-0.25, 0.19, 0.94]}
        scale={6.3}
        rotation={[0, -0.025, 0]}
        dispose={null}
      />
      <primitive
        object={models[3]}
        position={[2.73, 0.08, -0.04]}
        scale={5.2}
        rotation={[0, -0.35, 0]}
        dispose={null}
      />
      <primitive
        object={models[4]}
        position={[1.73, 0.065, 1]}
        scale={6.3}
        rotation={[0, -0.1, 0]}
        dispose={null}
      />
    </>
  );
}
