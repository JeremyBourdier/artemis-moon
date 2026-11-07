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

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x, y, octaves = 5) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return val;
}

function createEarthTextures() {
  const width = 512;
  const height = 256;

  const surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = width;
  surfaceCanvas.height = height;
  const sCtx = surfaceCanvas.getContext('2d');
  const sImg = sCtx.createImageData(width, height);
  const sData = sImg.data;

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = width;
  cloudCanvas.height = height;
  const cCtx = cloudCanvas.getContext('2d');
  const cImg = cCtx.createImageData(width, height);
  const cData = cImg.data;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const lat = (v - 0.5) * Math.PI;
    const polarFactor = Math.pow(Math.abs(Math.sin(lat)), 3.2);

    for (let x = 0; x < width; x++) {
      const u = x / width;
      const idx = (y * width + x) * 4;

      // Seamless horizontal wrap via trig coordinates projected into noise
      const nx = Math.cos(u * Math.PI * 2) * 1.6 + 4.2;
      const ny = Math.sin(u * Math.PI * 2) * 1.6 + 7.1;
      const nz = v * 3.8;

      const cont = fbm2D(nx + nz * 0.45, ny - nz * 0.55, 5);
      const detail = fbm2D(nx * 3.2 + 11.3, ny * 3.2 + nz * 2.1, 4);
      const landVal = cont * 0.72 + detail * 0.28 - polarFactor * 0.12;

      let r = 10;
      let g = 34;
      let b = 78;

      if (polarFactor > 0.72) {
        // Polar ice cap
        r = 228;
        g = 238;
        b = 248;
      } else if (landVal > 0.53) {
        const elev = Math.min(1, (landVal - 0.53) / 0.28);
        const arid = fbm2D(nx * 2.1 + 5.0, nz * 2.5, 3);
        if (elev > 0.68) {
          // Highland / mountain snow
          r = 152 + elev * 60;
          g = 148 + elev * 58;
          b = 142 + elev * 58;
        } else if (arid > 0.56) {
          // Warm ochre / desert
          r = 148 + detail * 42;
          g = 124 + detail * 32;
          b = 86 + detail * 20;
        } else {
          // Forest / temperate continent
          r = 38 + detail * 35;
          g = 86 + detail * 46;
          b = 52 + detail * 24;
        }
      } else {
        // Deep ocean to shallow shelf
        const shelf = Math.max(0, (landVal - 0.43) / 0.1);
        r = 9 + shelf * 18;
        g = 32 + shelf * 46;
        b = 76 + shelf * 62;
      }

      sData[idx] = Math.min(255, Math.max(0, r));
      sData[idx + 1] = Math.min(255, Math.max(0, g));
      sData[idx + 2] = Math.min(255, Math.max(0, b));
      sData[idx + 3] = 255;

      // Swirling cloud bands
      const swirl = fbm2D(nx * 2.4 + Math.sin(lat * 4.0) * 0.7, ny * 2.4 + nz * 1.9, 5);
      const wisps = fbm2D(nx * 5.5 + 19.0, ny * 5.5 - nz * 3.3, 4);
      const cloudRaw = swirl * 0.68 + wisps * 0.32;
      const cloudAlpha = Math.max(0, Math.min(1, (cloudRaw - 0.48) * 3.4));

      cData[idx] = 244;
      cData[idx + 1] = 248;
      cData[idx + 2] = 255;
      cData[idx + 3] = Math.round(cloudAlpha * 235);
    }
  }

  sCtx.putImageData(sImg, 0, 0);
  cCtx.putImageData(cImg, 0, 0);

  const surfaceTex = new THREE.CanvasTexture(surfaceCanvas);
  surfaceTex.colorSpace = THREE.SRGBColorSpace;
  surfaceTex.wrapS = THREE.RepeatWrapping;
  surfaceTex.wrapT = THREE.ClampToEdgeWrapping;

  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  cloudTex.wrapS = THREE.RepeatWrapping;
  cloudTex.wrapT = THREE.ClampToEdgeWrapping;

  return { surfaceTex, cloudTex };
}

function createStarfield() {
  const count = 2600;
  const rng = mulberry32(90210);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    // Bias stars slightly toward upper hemisphere above horizon
    const u = rng() * 1.15 - 0.12;
    const phi = Math.acos(Math.max(-1, Math.min(1, u)));
    const r = 380 + rng() * 40;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    // Subtle color temperature variation (cool blue-white, pure white, pale warm gold)
    const tint = rng();
    const brightness = 0.38 + Math.pow(rng(), 2.2) * 0.62;
    if (tint < 0.25) {
      colors[i * 3] = brightness * 0.78;
      colors[i * 3 + 1] = brightness * 0.88;
      colors[i * 3 + 2] = brightness * 1.0;
    } else if (tint < 0.82) {
      colors[i * 3] = brightness * 0.94;
      colors[i * 3 + 1] = brightness * 0.96;
      colors[i * 3 + 2] = brightness * 1.0;
    } else {
      colors[i * 3] = brightness * 1.0;
      colors[i * 3 + 1] = brightness * 0.91;
      colors[i * 3 + 2] = brightness * 0.78;
    }

    sizes[i] = 0.8 + Math.pow(rng(), 4.0) * 2.4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (340.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 4.2);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c) * 2.0;
        if (d > 1.0) discard;
        float core = exp(-d * d * 4.5);
        gl_FragColor = vec4(vColor * core, core);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'Starfield';
  points.frustumCulled = false;
  return points;
}

function createEarthGroup(sunDirection) {
  const group = new THREE.Group();
  group.name = 'DistantEarth';
  // Positioned above the rear-left lunar horizon so hero shot frames lander + Earth
  group.position.set(-48, 29, -155);

  const { surfaceTex, cloudTex } = createEarthTextures();
  const radius = 9.4;

  const earthGeo = new THREE.SphereGeometry(radius, 64, 48);
  const earthMat = new THREE.MeshStandardMaterial({
    map: surfaceTex,
    roughness: 0.62,
    metalness: 0.08,
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.rotation.y = -1.15;
  earthMesh.rotation.z = 0.36;
  group.add(earthMesh);

  // Cloud layer
  const cloudGeo = new THREE.SphereGeometry(radius * 1.012, 64, 48);
  const cloudMat = new THREE.MeshStandardMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.88,
    roughness: 0.85,
    metalness: 0.0,
    depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.rotation.y = -0.8;
  group.add(cloudMesh);

  // Fresnel Rayleigh atmosphere rim glow
  const atmoGeo = new THREE.SphereGeometry(radius * 1.075, 64, 48);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDirection.clone().normalize() },
      uGlowColor: { value: new THREE.Color(0x4ca6ff) },
      uTwilightColor: { value: new THREE.Color(0x88c8ff) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uGlowColor;
      uniform vec3 uTwilightColor;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        float viewDot = clamp(dot(vNormalWorld, vViewDir), 0.0, 1.0);
        float rim = pow(1.0 - viewDot, 3.2);
        float sunLit = smoothstep(-0.35, 0.65, dot(vNormalWorld, uSunDir));
        vec3 col = mix(uGlowColor, uTwilightColor, rim * 0.55) * (0.18 + 0.92 * sunLit);
        float alpha = rim * (0.25 + 0.75 * sunLit);
        gl_FragColor = vec4(col, alpha * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  group.add(atmoMesh);

  return {
    group,
    earthMesh,
    cloudMesh,
    textures: [surfaceTex, cloudTex],
  };
}

export function createSceneContext(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  // Very subtle distant horizon depth cue so the lunar rim blends into pitch black space
  scene.fog = new THREE.FogExp2(0x030509, 0.0032);

  // Low sun angle (~8.5 deg elevation) for harsh, dramatic lunar shadows
  const sunPosition = new THREE.Vector3(120, 18.5, -52);
  const sunDirection = sunPosition.clone().normalize();

  const sunLight = new THREE.DirectionalLight(0xf6f8ff, 3.15);
  sunLight.position.copy(sunPosition);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 25;
  sunLight.shadow.camera.far = 260;
  const shadowBounds = 46;
  sunLight.shadow.camera.left = -shadowBounds;
  sunLight.shadow.camera.right = shadowBounds;
  sunLight.shadow.camera.top = shadowBounds;
  sunLight.shadow.camera.bottom = -shadowBounds;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.025;
  sunLight.shadow.radius = 4;
  scene.add(sunLight);

  // Subtle cool Earthshine + bounced regolith fill so shadows have filmic detail instead of crushed zero
  const hemiLight = new THREE.HemisphereLight(0x283854, 0x12151c, 0.24);
  scene.add(hemiLight);

  // Subtle rim light from Earth direction
  const earthRimLight = new THREE.DirectionalLight(0x4c78b8, 0.22);
  earthRimLight.position.set(-55, 32, -140);
  scene.add(earthRimLight);

  const starfield = createStarfield();
  scene.add(starfield);

  const earth = createEarthGroup(sunDirection);
  scene.add(earth.group);

  function update(t) {
    // Deterministic rotation based on timeline time t
    earth.earthMesh.rotation.y = -1.15 + t * 0.012;
    earth.cloudMesh.rotation.y = -0.8 + t * 0.019;
  }

  function resize(width, height) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
  }

  function dispose() {
    earth.textures.forEach((tex) => tex.dispose());
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    renderer.dispose();
  }

  return {
    renderer,
    scene,
    sunLight,
    sunDirection,
    earthGroup: earth.group,
    update,
    resize,
    dispose,
  };
}
