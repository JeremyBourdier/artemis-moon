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
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.07;
    amp *= 0.5;
  }
  return val;
}

function generateCraters(seed = 19692026) {
  const rng = mulberry32(seed);
  const craters = [];

  // 14 large landmark craters in mid/far ground
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const dist = 24 + rng() * 88;
    const r = 6.5 + rng() * 14.0;
    craters.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      r,
      depth: r * (0.15 + rng() * 0.06),
      rim: r * (0.048 + rng() * 0.025),
    });
  }

  // 55 medium craters across the lunar plain
  for (let i = 0; i < 55; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 8.5 + Math.pow(rng(), 0.78) * 100;
    const r = 2.0 + rng() * 4.8;
    craters.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      r,
      depth: r * (0.17 + rng() * 0.06),
      rim: r * (0.052 + rng() * 0.025),
    });
  }

  // 175 small & micro impact craters (total = 244 craters)
  for (let i = 0; i < 175; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 4.2 + Math.pow(rng(), 0.85) * 92;
    const r = 0.55 + rng() * 1.65;
    craters.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      r,
      depth: r * (0.18 + rng() * 0.07),
      rim: r * (0.055 + rng() * 0.025),
    });
  }

  return craters;
}

function createRegolithTextures() {
  const size = 512;
  const heights = new Float32Array(size * size);
  const rng = mulberry32(42069);

  // Micro-craters baked into the tileable regolith texture
  const microCraters = [];
  for (let i = 0; i < 140; i++) {
    microCraters.push({
      u: rng(),
      v: rng(),
      r: 0.012 + Math.pow(rng(), 2.2) * 0.055,
      depth: 0.18 + rng() * 0.35,
    });
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Tileable noise lookup via 4D torus projection approximated in 2D
      const n1 = fbm2D(u * 16.0, v * 16.0, 5);
      const n2 = fbm2D(u * 48.0 + 9.2, v * 48.0 + 3.7, 4);
      const grain = (hash2(x, y) - 0.5) * 0.08;
      let h = n1 * 0.62 + n2 * 0.3 + grain;

      for (let k = 0; k < microCraters.length; k++) {
        const mc = microCraters[k];
        let du = Math.abs(u - mc.u);
        let dv = Math.abs(v - mc.v);
        if (du > 0.5) du = 1.0 - du;
        if (dv > 0.5) dv = 1.0 - dv;
        const d = Math.sqrt(du * du + dv * dv);
        const q = d / mc.r;
        if (q < 1.55) {
          if (q < 1.0) {
            h -= (1.0 - q * q) * mc.depth;
          } else {
            const t = (q - 1.0) / 0.55;
            h += Math.sin(t * Math.PI) * mc.depth * 0.25;
          }
        }
      }

      heights[y * size + x] = h;
    }
  }

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const cData = colorImg.data;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  const normalImg = normalCtx.createImageData(size, size);
  const nData = normalImg.data;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');
  const roughImg = roughCtx.createImageData(size, size);
  const rData = roughImg.data;

  const bumpStrength = 5.2;

  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const idx = (y * size + x) * 4;
      const h = heights[y * size + x];

      // Cool monochrome lunar regolith albedo
      const baseLum = Math.max(45, Math.min(220, 128 + (h - 0.45) * 95));
      cData[idx] = Math.round(baseLum * 0.96);
      cData[idx + 1] = Math.round(baseLum * 0.98);
      cData[idx + 2] = Math.round(baseLum * 1.03);
      cData[idx + 3] = 255;

      // Sobel-like gradient for normal map
      const dX = (heights[y * size + xNext] - heights[y * size + xPrev]) * bumpStrength;
      const dY = (heights[yNext * size + x] - heights[yPrev * size + x]) * bumpStrength;
      const invLen = 1.0 / Math.sqrt(dX * dX + dY * dY + 1.0);
      const nx = -dX * invLen;
      const ny = -dY * invLen;
      const nz = invLen;

      nData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      nData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nData[idx + 3] = 255;

      // High roughness (0.84 - 0.98) for dusty lunar soil
      const roughVal = Math.max(210, Math.min(252, Math.round(238 - (h - 0.45) * 32)));
      rData[idx] = roughVal;
      rData[idx + 1] = roughVal;
      rData[idx + 2] = roughVal;
      rData[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  normalCtx.putImageData(normalImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const repeat = 26;

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(repeat, repeat);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeat, repeat);

  return { colorMap, normalMap, roughnessMap };
}

export function createMoonSurface(scene) {
  const craters = generateCraters(19692026);

  function evaluateHeight(x, z) {
    const dist = Math.sqrt(x * x + z * z);

    // Keep landing pad (radius < 4.2m) gently flat so all 4 footpads contact cleanly at y = 0
    const padFlatten = THREE.MathUtils.smoothstep(dist, 2.8, 10.5);

    // Macro fBm terrain hills + distant rim ridge
    const macro = (fbm2D(x * 0.018 + 10.5, z * 0.018 + 22.1, 5) - 0.48) * 5.6;
    const meso = (fbm2D(x * 0.075 - 4.3, z * 0.075 + 8.7, 4) - 0.48) * 0.95;

    // Subtle elevation rise on the distant horizon (especially behind lander)
    const horizonRise =
      THREE.MathUtils.smoothstep(dist, 42, 130) *
      (2.4 + 3.2 * Math.max(0, -z / (dist + 0.001)) * fbm2D(x * 0.025 + 3.1, z * 0.025, 3));

    let craterOffset = 0;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const maxR = c.r * 1.48;
      if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue;

      const d2 = dx * dx + dz * dz;
      if (d2 >= maxR * maxR) continue;

      const q = Math.sqrt(d2) / c.r;
      if (q < 1.0) {
        // Smooth bowl with slightly flattened floor
        const bowl = 1.0 - Math.pow(q, 2.15);
        craterOffset -= c.depth * bowl;
      } else {
        // Raised ejecta rim
        const t = (q - 1.0) / 0.48;
        const rimWave = Math.sin(t * Math.PI);
        craterOffset += c.rim * rimWave * rimWave;
      }
    }

    return (macro + meso + craterOffset) * padFlatten + horizonRise;
  }

  const planeSize = 260;
  const segments = 256;
  const geometry = new THREE.PlaneGeometry(planeSize, planeSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = evaluateHeight(x, z);
    posAttr.setY(i, y);

    // Subtle vertex color modulation: slightly darker in crater bowls and blast zone, lighter on rims
    const distFromPad = Math.sqrt(x * x + z * z);
    const blastDarken = 1.0 - 0.14 * Math.exp(-distFromPad * distFromPad * 0.045);
    const heightShade = THREE.MathUtils.clamp(0.88 + y * 0.032, 0.72, 1.12);
    const vShade = blastDarken * heightShade;

    colors[i * 3] = vShade * 0.95;
    colors[i * 3 + 1] = vShade * 0.97;
    colors[i * 3 + 2] = vShade * 1.02;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const textures = createRegolithTextures();

  const material = new THREE.MeshStandardMaterial({
    map: textures.colorMap,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: textures.roughnessMap,
    roughness: 0.94,
    metalness: 0.04,
    vertexColors: true,
  });

  const terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.name = 'LunarTerrain';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  // Scattered angular lunar ejecta rocks around the landing zone for scale & harsh long shadows
  const rockCount = 90;
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rPos = rockGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const warp = 0.78 + 0.36 * hash2(vx * 13.7 + vy * 7.1, vz * 19.3);
    rPos.setXYZ(i, vx * warp, vy * warp * 0.68, vz * warp);
  }
  rockGeo.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.colorMap,
    normalMap: textures.normalMap,
    roughness: 0.92,
    metalness: 0.05,
    color: new THREE.Color(0x8c929d),
  });

  const rocksInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocksInstanced.castShadow = true;
  rocksInstanced.receiveShadow = true;
  rocksInstanced.name = 'LunarRocks';

  const rng = mulberry32(77123);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 5.2 + Math.pow(rng(), 1.3) * 48;
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const ry = evaluateHeight(rx, rz);

    const scale = 0.09 + Math.pow(rng(), 2.6) * 0.52;
    dummy.position.set(rx, ry + scale * 0.22, rz);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.scale.set(
      scale * (0.85 + rng() * 0.4),
      scale * (0.65 + rng() * 0.35),
      scale * (0.85 + rng() * 0.4)
    );
    dummy.updateMatrix();
    rocksInstanced.setMatrixAt(i, dummy.matrix);
  }
  rocksInstanced.instanceMatrix.needsUpdate = true;
  scene.add(rocksInstanced);

  function dispose() {
    textures.colorMap.dispose();
    textures.normalMap.dispose();
    textures.roughnessMap.dispose();
    geometry.dispose();
    material.dispose();
    rockGeo.dispose();
    rockMat.dispose();
  }

  return {
    terrainMesh,
    rocksInstanced,
    cratersCount: craters.length,
    getHeightAt: evaluateHeight,
    dispose,
  };
}
