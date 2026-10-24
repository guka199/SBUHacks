"use client";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, Group } from "three";
// Separate from the user's ocean wallpaper: a CC0 outdoor backplate in real scene depth.
export function WindowLandscape() {
  const source = useTexture("/assets/scenery/meadow.webp"),
    clouds = useRef<Group>(null),
    reduce = useRef(false);
  const uniforms = useRef({ uOutdoorPhase: { value: 0 } });
  const { photo, material, cloudTexture } = useMemo(() => {
    const photo = source.clone();
    photo.colorSpace = SRGBColorSpace;
    photo.anisotropy = 4;
    photo.needsUpdate = true;
    const material = new MeshBasicMaterial({ map: photo, toneMapped: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOutdoorPhase = uniforms.current.uOutdoorPhase;
      shader.vertexShader =
        "uniform float uOutdoorPhase;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
   float canopy = smoothstep(.22,.4,uv.y) * (1.-smoothstep(.65,.85,uv.y));
   transformed.x += sin(uOutdoorPhase*6.+uv.y*9.+uv.x*7.) * .035 * canopy;
   transformed.x += sin(uOutdoorPhase) * .16 * smoothstep(.58,.82,uv.y);`,
      );
    };
    material.customProgramCacheKey = () => "viralpilot-outdoor-breeze-v1";
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    [
      [110, 140, 72],
      [175, 110, 92],
      [250, 120, 105],
      [335, 146, 84],
      [395, 157, 62],
    ].forEach(([x, y, r]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.35)");
      g.addColorStop(0.48, "rgba(255,255,255,.17)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 256);
    });
    const cloudTexture = new CanvasTexture(canvas);
    cloudTexture.colorSpace = SRGBColorSpace;
    return { photo, material, cloudTexture };
  }, [source]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion:reduce)");
    const change = () => {
      reduce.current = media.matches;
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(
    () => () => {
      photo.dispose();
      material.dispose();
      cloudTexture.dispose();
    },
    [photo, material, cloudTexture],
  );
  useFrame(({ clock }) => {
    if (reduce.current) return;
    const phase = ((clock.elapsedTime % 180) / 180) * Math.PI * 2;
    uniforms.current.uOutdoorPhase.value = phase;
    if (clouds.current) {
      clouds.current.position.x = Math.sin(phase) * 0.45;
      clouds.current.position.y = Math.sin(phase) * 0.025;
    }
  });
  return (
    <group>
      <mesh position={[0, 0.6, -14]} material={material}>
        <planeGeometry args={[30, 20, 48, 32]} />
      </mesh>
      <group ref={clouds}>
        <mesh position={[-4.6, 6.5, -10]}>
          <planeGeometry args={[8, 3]} />
          <meshBasicMaterial
            map={cloudTexture}
            transparent
            opacity={0.35}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[5.8, 7.1, -11]}>
          <planeGeometry args={[9, 3.3]} />
          <meshBasicMaterial
            map={cloudTexture}
            transparent
            opacity={0.25}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
