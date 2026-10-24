"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
export function CinematicPost() {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer | null>(null);
  useEffect(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
    });
    const effect = new EffectComposer(gl, target);
    effect.setPixelRatio(Math.min(gl.getPixelRatio(), 1.5));
    effect.addPass(new RenderPass(scene, camera));
    const finish = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);float edge=smoothstep(.25,.83,length(vUv-.5));c.rgb*=1.-.07*edge;gl_FragColor=c;}",
    });
    effect.addPass(finish);
    effect.addPass(new OutputPass());
    composer.current = effect;
    return () => {
      composer.current = null;
      effect.passes.forEach((pass) => pass.dispose());
      effect.dispose();
    };
  }, [gl, scene, camera]);
  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [size]);
  useFrame((_, delta) => composer.current?.render(delta), 1);
  return null;
}
