import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRegolithDust(scene) {
  const group = new THREE.Group();
  group.name = 'RegolithDustSystem';
  scene.add(group);

  // 1. RADIAL EJECTA PARTICLES (Points with custom deterministic time shader)
  const particleCount = 3400;
  const rng = mulberry32(314159);

  const positions = new Float32Array(particleCount * 3);
  const aAngle = new Float32Array(particleCount);
  const aSpeed = new Float32Array(particleCount);
  const aSeed = new Float32Array(particleCount);
  const aSize = new Float32Array(particleCount);
  const aLift = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0.1;
    positions[i * 3 + 2] = 0;

    aAngle[i] = rng() * Math.PI * 2;
    aSpeed[i] = 0.55 + rng() * 0.95;
    aSeed[i] = rng();
    // Mix of fine smoke-like dust clouds and fast-moving ballistic regolith streaks
    aSize[i] = 18.0 + Math.pow(rng(), 1.8) * 58.0;
    aLift[i] = 0.15 + Math.pow(rng(), 2.2) * 1.45;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(aAngle, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geometry.setAttribute('aLift', new THREE.BufferAttribute(aLift, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBlastIntensity: { value: 0 },
      uSettleFactor: { value: 0 },
      uEngineGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aAngle;
      attribute float aSpeed;
      attribute float aSeed;
      attribute float aSize;
      attribute float aLift;

      uniform float uTime;
      uniform float uBlastIntensity;
      uniform float uSettleFactor;

      varying float vAlpha;
      varying float vWarmth;
      varying float vSeed;
      varying float vRadialFrac;

      void main() {
        vSeed = aSeed;

        // Continuous cyclic life during burn/touchdown, slowing down as dust settles
        float rate = (0.48 + aSpeed * 0.36) * (1.0 - uSettleFactor * 0.55);
        float age = fract(uTime * rate + aSeed);

        // Radial distance from nozzle ground-zero
        float maxRadius = 22.0 + aSpeed * 16.0;
        float r = 0.65 + pow(age, 0.78) * maxRadius;
        vRadialFrac = clamp(r / 34.0, 0.0, 1.0);

        // Slight spiral turbulence
        float theta = aAngle + sin(age * 5.0 + aSeed * 12.0) * 0.12;

        // Low-angle lunar ballistic trajectory + billowing cloud rise at outer skirt
        float ballisticArc = 4.0 * age * (1.0 - age) * aLift * (1.35 - 0.65 * uSettleFactor);
        float outerBillow = smoothstep(0.25, 0.95, age) * aLift * 1.25 * (1.0 - uSettleFactor * 0.72);
        float y = 0.06 + ballisticArc + outerBillow;

        vec3 worldPos = vec3(cos(theta) * r, y, sin(theta) * r);
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);

        // Fade in quickly near center, fade out smoothly as sheet disperses
        float fadeIn = smoothstep(0.0, 0.12, age);
        float fadeOut = 1.0 - smoothstep(0.45, 1.0, age);
        vAlpha = fadeIn * fadeOut * uBlastIntensity;

        // Particles close to engine center pick up warm amber illumination from the plume
        vWarmth = exp(-r * 0.18);

        float scaleGrow = 0.55 + age * 1.85;
        gl_PointSize = aSize * scaleGrow * (220.0 / max(1.0, -mvPosition.z));
        gl_PointSize = clamp(gl_PointSize, 1.5, 96.0);

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEngineGlow;
      varying float vAlpha;
      varying float vWarmth;
      varying float vSeed;
      varying float vRadialFrac;

      void main() {
        if (vAlpha <= 0.002) discard;

        vec2 uv = gl_PointCoord - vec2(0.5);
        // Subtle anisotropic elongation for fast inner ejecta streaks
        float angle = vSeed * 6.2831853;
        float ca = cos(angle);
        float sa = sin(angle);
        vec2 rotUv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);
        rotUv.x *= mix(0.65, 1.0, vRadialFrac);

        float dist = length(rotUv) * 2.0;
        if (dist > 1.0) discard;

        // Soft gaussian-like cloud falloff (never harsh confetti circles)
        float softPuff = pow(1.0 - dist, 2.35);

        vec3 coolRegolith = vec3(0.52, 0.56, 0.62);
        vec3 warmPlumeLit = vec3(0.95, 0.64, 0.36);
        vec3 col = mix(coolRegolith, warmPlumeLit, vWarmth * uEngineGlow * 0.85);

        // Keep luminance below bloom threshold so dust stays atmospheric and doesn't white-out
        float finalAlpha = softPuff * vAlpha * 0.16;
        gl_FragColor = vec4(col * finalAlpha, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dustPoints = new THREE.Points(geometry, material);
  dustPoints.name = 'RegolithDustPoints';
  dustPoints.frustumCulled = false;
  group.add(dustPoints);

  // 2. GROUND BLAST SHEET DISC (Sweeping radial regolith vapor ring hugging the surface)
  const sheetGeo = new THREE.RingGeometry(0.35, 22.0, 64, 8);
  sheetGeo.rotateX(-Math.PI / 2);

  const sheetMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uEngineGlow: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      varying float vRadius;
      void main() {
        vPos = position.xz;
        vRadius = length(position.xz);
        vec3 pos = position;
        pos.y += 0.08 + 0.04 * sin(vRadius * 0.8);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uEngineGlow;
      varying vec2 vPos;
      varying float vRadius;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        if (uIntensity <= 0.002) discard;

        float angle = atan(vPos.y, vPos.x);
        float streaks = noise(vec2(angle * 14.0, vRadius * 0.45 - uTime * 9.5));
        float fineStreaks = noise(vec2(angle * 32.0 + 4.2, vRadius * 0.9 - uTime * 15.0));
        float pattern = streaks * 0.65 + fineStreaks * 0.35;

        float radialEnvelope = smoothstep(0.4, 2.2, vRadius) * (1.0 - smoothstep(6.0, 21.5, vRadius));
        float coreWarmth = exp(-vRadius * 0.28) * uEngineGlow;

        vec3 dustCol = mix(vec3(0.46, 0.50, 0.56), vec3(0.95, 0.62, 0.32), coreWarmth);
        float alpha = radialEnvelope * (0.35 + 0.65 * pattern) * uIntensity * 0.28;

        gl_FragColor = vec4(dustCol * alpha, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const sheetMesh = new THREE.Mesh(sheetGeo, sheetMat);
  sheetMesh.name = 'GroundDustSheet';
  group.add(sheetMesh);

  function update(state, t) {
    const { dustIntensity, dustSettle, throttle } = state;

    material.uniforms.uTime.value = t;
    material.uniforms.uBlastIntensity.value = dustIntensity;
    material.uniforms.uSettleFactor.value = dustSettle;
    material.uniforms.uEngineGlow.value = throttle;

    sheetMat.uniforms.uTime.value = t;
    sheetMat.uniforms.uIntensity.value = dustIntensity * (1.0 - dustSettle * 0.45);
    sheetMat.uniforms.uEngineGlow.value = throttle;

    group.visible = dustIntensity > 0.002;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    sheetGeo.dispose();
    sheetMat.dispose();
  }

  return {
    group,
    update,
    dispose,
  };
}
