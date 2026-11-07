import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const FilmicGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignetteDarkness: { value: 0.42 },
    uVignetteOffset: { value: 1.08 },
    uGrainStrength: { value: 0.022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uGrainStrength;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Subtle cool lunar shadow tint while preserving warm engine highlights
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 coolShadow = vec3(0.95, 0.98, 1.05);
      vec3 warmHighlight = vec3(1.03, 1.0, 0.96);
      col *= mix(coolShadow, warmHighlight, clamp(luma, 0.0, 1.0));

      // Filmic S-curve contrast nudge
      col = mix(col, smoothstep(0.0, 1.0, col), 0.12);

      // Smooth radial vignette
      vec2 centered = (vUv - vec2(0.5)) * vec2(uVignetteOffset);
      float vig = clamp(1.0 - dot(centered, centered) * uVignetteDarkness, 0.25, 1.0);
      col *= vig;

      // Fine deterministic film grain
      float grain = (hash(vUv * 512.0 + fract(uTime * 0.37)) - 0.5) * uGrainStrength;
      col = max(vec3(0.0), col + grain);

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

export function createPostProcessing(renderer, scene, camera) {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // High threshold (1.08) ensures ONLY emissive windows, beacon, and hot engine plume bloom
  // while regolith terrain stays crisp and high-contrast.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.58, // strength
    0.38, // radius
    1.08  // threshold
  );
  composer.addPass(bloomPass);

  const gradingPass = new ShaderPass(FilmicGradingShader);
  composer.addPass(gradingPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  function render(t) {
    gradingPass.uniforms.uTime.value = t;
    composer.render();
  }

  function resize(newWidth, newHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    composer.setPixelRatio(dpr);
    composer.setSize(newWidth, newHeight);
    bloomPass.resolution.set(newWidth, newHeight);
  }

  function dispose() {
    bloomPass.dispose();
    composer.dispose();
  }

  return {
    composer,
    bloomPass,
    gradingPass,
    render,
    resize,
    dispose,
  };
}
