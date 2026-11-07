import * as THREE from 'three';

function createHullPanelTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#dde3ec';
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal & vertical hull plating seams
  ctx.strokeStyle = '#9aa5b6';
  ctx.lineWidth = 1.5;
  for (let y = 0; y <= size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }

  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 32;
    for (let x = offset; x <= size; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, row * 32);
      ctx.lineTo(x + 0.5, (row + 1) * 32);
      ctx.stroke();

      // Subtle thermal tile tonal shift
      const shade = 212 + ((x * 7 + row * 13) % 20);
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
      ctx.fillRect(x + 2, row * 32 + 2, 60, 28);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

function createFoilTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const crinkle =
        Math.sin(x * 0.42 + Math.cos(y * 0.35) * 2.2) * 0.5 +
        Math.cos(y * 0.55 - Math.sin(x * 0.48) * 1.8) * 0.5;
      const v = 128 + crinkle * 58;
      d[idx] = Math.min(255, Math.max(0, v * 0.55));
      d[idx + 1] = Math.min(255, Math.max(0, v * 0.52));
      d[idx + 2] = Math.min(255, Math.max(0, 240));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const normalTex = new THREE.CanvasTexture(canvas);
  normalTex.colorSpace = THREE.NoColorSpace;
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(6, 4);
  return normalTex;
}

function createPlumeMesh() {
  const plumeGroup = new THREE.Group();
  plumeGroup.name = 'MainEnginePlume';
  // Origin at engine bell exit (y = 0 in local group), cone extends downward (-Y)
  const outerHeight = 6.8;
  const outerGeo = new THREE.CylinderGeometry(0.32, 2.35, outerHeight, 40, 28, true);
  outerGeo.translate(0, -outerHeight * 0.5, 0);

  const outerMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uThrottle;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

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
        vUv = uv;
        // uv.y is 1 at top (nozzle exit) and 0 at bottom tip
        float flow = 1.0 - uv.y;
        float turb = noise(vec2(uv.x * 8.0, flow * 5.0 - uTime * 22.0)) - 0.5;
        vec3 displaced = position;
        float radialExpand = 1.0 + flow * (0.25 + 0.35 * (1.0 - uThrottle)) + turb * 0.14 * flow;
        displaced.x *= radialExpand;
        displaced.z *= radialExpand;
        displaced.y *= (0.45 + 0.65 * uThrottle);

        vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uThrottle;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;

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
        if (uThrottle <= 0.001) discard;

        // flow = 0 at nozzle exit, 1 at bottom of plume
        float flow = 1.0 - vUv.y;
        float n1 = noise(vec2(vUv.x * 10.0, flow * 7.0 - uTime * 28.0));
        float n2 = noise(vec2(vUv.x * 20.0 + 3.1, flow * 14.0 - uTime * 42.0));
        float turb = n1 * 0.65 + n2 * 0.35;

        // Mach shock diamonds near top of plume
        float shock = pow(max(0.0, cos(flow * 26.0 - uTime * 8.0)), 4.0) * exp(-flow * 2.8);

        // Soft edge fade
        float edge = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 0.75);
        float verticalFade = smoothstep(0.0, 0.06, flow) * pow(max(0.0, 1.0 - flow), 1.45);

        vec3 hotCore = vec3(3.4, 2.9, 2.3);
        vec3 midAmber = vec3(2.2, 1.15, 0.38);
        vec3 outerBlue = vec3(0.45, 0.62, 1.15);

        vec3 col = mix(hotCore, midAmber, smoothstep(0.05, 0.55, flow));
        col = mix(col, outerBlue, smoothstep(0.55, 0.98, flow) * 0.55);
        col += hotCore * shock * 0.75;
        col *= (0.78 + 0.45 * turb);

        float alpha = verticalFade * (0.28 + 0.72 * edge) * (0.65 + 0.35 * turb) * uThrottle;
        gl_FragColor = vec4(col * uThrottle, alpha * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  plumeGroup.add(outerMesh);

  // Inner hyper-bright turbulent core
  const innerHeight = 3.8;
  const innerGeo = new THREE.CylinderGeometry(0.22, 0.88, innerHeight, 32, 18, true);
  innerGeo.translate(0, -innerHeight * 0.5, 0);

  const innerMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uThrottle;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        float flow = 1.0 - uv.y;
        vec3 pos = position;
        pos.y *= (0.5 + 0.6 * uThrottle);
        pos.xz *= (1.0 + 0.08 * sin(flow * 18.0 - uTime * 35.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uThrottle;
      varying vec2 vUv;
      void main() {
        if (uThrottle <= 0.001) discard;
        float flow = 1.0 - vUv.y;
        float fade = pow(max(0.0, 1.0 - flow), 1.9);
        float diamonds = 0.75 + 0.35 * cos(flow * 32.0 - uTime * 30.0);
        vec3 col = mix(vec3(4.2, 3.6, 2.8), vec3(2.8, 1.45, 0.45), flow) * diamonds;
        gl_FragColor = vec4(col * uThrottle, fade * uThrottle * 0.92);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  plumeGroup.add(innerMesh);

  return {
    group: plumeGroup,
    outerMat,
    innerMat,
  };
}

export function createArtemisLander(scene) {
  const root = new THREE.Group();
  root.name = 'ArtemisLander';
  scene.add(root);

  // Chassis group dips slightly on suspension compression while footpads stay planted on regolith
  const chassis = new THREE.Group();
  chassis.name = 'LanderChassis';
  root.add(chassis);

  const hullTex = createHullPanelTexture();
  const foilNormal = createFoilTexture();

  const hullWhiteMat = new THREE.MeshStandardMaterial({
    map: hullTex,
    color: new THREE.Color(0xe6ecf5),
    roughness: 0.44,
    metalness: 0.22,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x232933),
    roughness: 0.48,
    metalness: 0.78,
  });

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8e99a8),
    roughness: 0.36,
    metalness: 0.82,
  });

  const goldFoilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd49b35),
    normalMap: foilNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.28,
    metalness: 0.88,
  });

  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x16243a),
    roughness: 0.25,
    metalness: 0.65,
  });

  // Emissive cabin windows (>1.0 HDR luminance so selective bloom catches them)
  const windowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffdfa8),
    emissive: new THREE.Color(0xffb454),
    emissiveIntensity: 2.35,
    roughness: 0.15,
    metalness: 0.1,
  });

  const navBeaconMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xfff0d0),
    emissive: new THREE.Color(0xff9436),
    emissiveIntensity: 2.6,
    roughness: 0.2,
  });

  // 1. DESCENT STAGE (Octagonal thermal-shielded propulsion module + propellant tanks)
  const descentCoreGeo = new THREE.CylinderGeometry(1.72, 1.82, 1.65, 8);
  const descentCore = new THREE.Mesh(descentCoreGeo, goldFoilMat);
  descentCore.position.y = 2.05;
  descentCore.castShadow = true;
  descentCore.receiveShadow = true;
  chassis.add(descentCore);

  // Structural thrust ring at base & top of descent stage
  const lowerRingGeo = new THREE.CylinderGeometry(1.88, 1.88, 0.22, 16);
  const lowerRing = new THREE.Mesh(lowerRingGeo, darkAlloyMat);
  lowerRing.position.y = 1.24;
  lowerRing.castShadow = true;
  lowerRing.receiveShadow = true;
  chassis.add(lowerRing);

  const interstageGeo = new THREE.CylinderGeometry(1.62, 1.84, 0.42, 16);
  const interstage = new THREE.Mesh(interstageGeo, darkAlloyMat);
  interstage.position.y = 3.02;
  interstage.castShadow = true;
  interstage.receiveShadow = true;
  chassis.add(interstage);

  // 4 spherical propellant tanks nested around the descent stage
  const tankGeo = new THREE.SphereGeometry(0.56, 24, 18);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const tank = new THREE.Mesh(tankGeo, i % 2 === 0 ? goldFoilMat : hullWhiteMat);
    tank.position.set(Math.cos(angle) * 1.55, 1.98, Math.sin(angle) * 1.55);
    tank.scale.set(1.0, 1.18, 1.0);
    tank.castShadow = true;
    tank.receiveShadow = true;
    chassis.add(tank);
  }

  // 2. CREW CAPSULE / ASCENT CABIN (Ribbed white cylindrical hull + tapered nose cone)
  const cabinCylinderGeo = new THREE.CylinderGeometry(1.58, 1.62, 2.55, 32);
  const cabinCylinder = new THREE.Mesh(cabinCylinderGeo, hullWhiteMat);
  cabinCylinder.position.y = 4.48;
  cabinCylinder.castShadow = true;
  cabinCylinder.receiveShadow = true;
  chassis.add(cabinCylinder);

  // Tapered upper fairing / nose section
  const upperConeGeo = new THREE.CylinderGeometry(0.92, 1.58, 1.38, 32);
  const upperCone = new THREE.Mesh(upperConeGeo, hullWhiteMat);
  upperCone.position.y = 6.44;
  upperCone.castShadow = true;
  upperCone.receiveShadow = true;
  chassis.add(upperCone);

  // Docking adapter collar & hatch at apex
  const dockCollarGeo = new THREE.CylinderGeometry(0.76, 0.92, 0.28, 24);
  const dockCollar = new THREE.Mesh(dockCollarGeo, darkAlloyMat);
  dockCollar.position.y = 7.26;
  dockCollar.castShadow = true;
  chassis.add(dockCollar);

  const dockRimGeo = new THREE.TorusGeometry(0.74, 0.05, 12, 28);
  dockRimGeo.rotateX(Math.PI / 2);
  const dockRim = new THREE.Mesh(dockRimGeo, titaniumMat);
  dockRim.position.y = 7.41;
  chassis.add(dockRim);

  // Vertical external structural stringers / aero-flanges on crew cabin
  const stringerGeo = new THREE.BoxGeometry(0.11, 2.45, 0.16);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const stringer = new THREE.Mesh(stringerGeo, darkAlloyMat);
    stringer.position.set(Math.cos(angle) * 1.58, 4.45, Math.sin(angle) * 1.58);
    stringer.rotation.y = -angle;
    stringer.castShadow = true;
    chassis.add(stringer);
  }

  // Egress porch + crew ladder on front (+Z) side
  const porchGeo = new THREE.BoxGeometry(0.76, 0.08, 0.52);
  const porch = new THREE.Mesh(porchGeo, titaniumMat);
  porch.position.set(0, 3.15, 1.88);
  porch.castShadow = true;
  chassis.add(porch);

  const railGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.45, 8);
  for (const side of [-0.24, 0.24]) {
    const rail = new THREE.Mesh(railGeo, titaniumMat);
    rail.position.set(side, 2.02, 2.12);
    rail.rotation.x = 0.18;
    rail.castShadow = true;
    chassis.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.48, 8);
  rungGeo.rotateZ(Math.PI / 2);
  for (let r = 0; r < 7; r++) {
    const rung = new THREE.Mesh(rungGeo, titaniumMat);
    const frac = r / 6;
    rung.position.set(0, 1.0 + frac * 2.05, 2.31 - frac * 0.36);
    chassis.add(rung);
  }

  // 3. CABIN WINDOWS WITH WARM EMISSIVE GLOW
  // Forward panoramic viewport array + side observation windows
  const windowFrameGeo = new THREE.BoxGeometry(0.56, 0.34, 0.08);
  const windowPaneGeo = new THREE.PlaneGeometry(0.46, 0.24);

  const windowAngles = [-0.42, -0.14, 0.14, 0.42, Math.PI * 0.5, -Math.PI * 0.5];
  windowAngles.forEach((ang) => {
    const winGroup = new THREE.Group();
    const radius = 1.59;
    winGroup.position.set(Math.sin(ang) * radius, 5.15, Math.cos(ang) * radius);
    winGroup.rotation.y = ang;

    const frame = new THREE.Mesh(windowFrameGeo, darkAlloyMat);
    const pane = new THREE.Mesh(windowPaneGeo, windowMat);
    pane.position.z = 0.046;
    winGroup.add(frame);
    winGroup.add(pane);
    chassis.add(winGroup);
  });

  // Upper forward docking observation slit
  const upperWindowPane = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.18), windowMat);
  upperWindowPane.position.set(0, 6.28, 1.32);
  upperWindowPane.rotation.x = -0.38;
  chassis.add(upperWindowPane);

  // 4. HIGH-GAIN ANTENNA MAST + DISH + SOLAR ARRAY WINGS
  const antennaMastGeo = new THREE.CylinderGeometry(0.022, 0.035, 1.65, 10);
  const antennaMast = new THREE.Mesh(antennaMastGeo, titaniumMat);
  antennaMast.position.set(0.52, 7.95, -0.25);
  antennaMast.castShadow = true;
  chassis.add(antennaMast);

  const dishGeo = new THREE.SphereGeometry(0.38, 20, 12, 0, Math.PI * 2, 0, 0.95);
  const dish = new THREE.Mesh(dishGeo, titaniumMat);
  dish.position.set(0.52, 8.35, -0.18);
  dish.rotation.x = -1.1;
  dish.rotation.z = -0.35;
  chassis.add(dish);

  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), navBeaconMat);
  beaconMesh.position.set(0.52, 8.8, -0.25);
  chassis.add(beaconMesh);

  // Dual compact radial solar array fins on upper deck
  const panelWingGeo = new THREE.BoxGeometry(1.35, 0.04, 0.62);
  for (const dir of [-1, 1]) {
    const wing = new THREE.Mesh(panelWingGeo, solarPanelMat);
    wing.position.set(dir * 2.15, 3.85, -0.2);
    wing.rotation.z = dir * 0.08;
    wing.rotation.x = 0.22;
    wing.castShadow = true;
    chassis.add(wing);
  }

  // 5. RCS THRUSTER QUADS + COLD-GAS PUFF CONES
  const rcsPodGeo = new THREE.BoxGeometry(0.24, 0.28, 0.24);
  const rcsNozzleGeo = new THREE.ConeGeometry(0.055, 0.14, 10);
  const rcsPuffGeo = new THREE.ConeGeometry(0.18, 0.95, 12, 1, true);
  rcsPuffGeo.translate(0, -0.475, 0);

  const rcsPuffMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xc8e4ff),
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const rcsPuffs = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const podGroup = new THREE.Group();
    podGroup.position.set(Math.sin(angle) * 1.66, 5.55, Math.cos(angle) * 1.66);
    podGroup.rotation.y = angle;

    const pod = new THREE.Mesh(rcsPodGeo, darkAlloyMat);
    podGroup.add(pod);

    // Downward & outward vernier nozzles
    const nozDown = new THREE.Mesh(rcsNozzleGeo, titaniumMat);
    nozDown.position.set(0, -0.18, 0.06);
    podGroup.add(nozDown);

    const puff = new THREE.Mesh(rcsPuffGeo, rcsPuffMat.clone());
    puff.position.set(0, -0.2, 0.08);
    puff.rotation.x = 0.35;
    podGroup.add(puff);
    rcsPuffs.push(puff);

    chassis.add(podGroup);
  }

  // 6. MAIN ENGINE BELL CLUSTER + PLUME + DYNAMIC ENGINE POINT LIGHT
  const engineBellGeo = new THREE.CylinderGeometry(0.24, 0.56, 0.85, 28, 1, true);
  const engineBellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x3a3f4b),
    emissive: new THREE.Color(0xff6a1a),
    emissiveIntensity: 0.0,
    roughness: 0.35,
    metalness: 0.85,
    side: THREE.DoubleSide,
  });
  const mainBell = new THREE.Mesh(engineBellGeo, engineBellMat);
  mainBell.position.y = 0.82;
  mainBell.castShadow = true;
  chassis.add(mainBell);

  // Two auxiliary vernier engine bells
  const auxBellGeo = new THREE.CylinderGeometry(0.12, 0.28, 0.58, 20, 1, true);
  for (const offsetX of [-0.68, 0.68]) {
    const auxBell = new THREE.Mesh(auxBellGeo, engineBellMat);
    auxBell.position.set(offsetX, 0.92, 0);
    chassis.add(auxBell);
  }

  const plume = createPlumeMesh();
  plume.group.position.set(0, 0.42, 0);
  chassis.add(plume.group);

  // Warm engine light illuminating the lunar regolith and landing legs during burn
  const engineLight = new THREE.PointLight(0xff9640, 0.0, 32, 1.7);
  engineLight.position.set(0, 0.35, 0);
  chassis.add(engineLight);

  // 7. ARTICULATED LANDING LEGS WITH FOOTPADS (4 heavy A-frame struts)
  const legsGroup = new THREE.Group();
  legsGroup.name = 'LandingLegs';
  root.add(legsGroup);

  const footpadGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.11, 24);
  const ankleBallGeo = new THREE.SphereGeometry(0.13, 14, 12);
  const unitStrutGeo = new THREE.CylinderGeometry(0.065, 0.055, 1.0, 12);
  unitStrutGeo.translate(0, 0.5, 0);
  const sideBraceGeo = new THREE.CylinderGeometry(0.038, 0.038, 1.0, 10);
  sideBraceGeo.translate(0, 0.5, 0);

  const legAssemblies = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const tangentX = -dirZ;
    const tangentZ = dirX;

    const footRadius = 3.25;
    const footPos = new THREE.Vector3(dirX * footRadius, 0.055, dirZ * footRadius);

    const padMesh = new THREE.Mesh(footpadGeo, titaniumMat);
    padMesh.position.copy(footPos);
    padMesh.castShadow = true;
    padMesh.receiveShadow = true;
    legsGroup.add(padMesh);

    const ankleMesh = new THREE.Mesh(ankleBallGeo, darkAlloyMat);
    ankleMesh.position.set(footPos.x, footPos.y + 0.09, footPos.z);
    legsGroup.add(ankleMesh);

    const primaryStrut = new THREE.Mesh(unitStrutGeo, goldFoilMat);
    primaryStrut.castShadow = true;
    legsGroup.add(primaryStrut);

    const leftBrace = new THREE.Mesh(sideBraceGeo, titaniumMat);
    leftBrace.castShadow = true;
    legsGroup.add(leftBrace);

    const rightBrace = new THREE.Mesh(sideBraceGeo, titaniumMat);
    rightBrace.castShadow = true;
    legsGroup.add(rightBrace);

    legAssemblies.push({
      dirX,
      dirZ,
      tangentX,
      tangentZ,
      footPos,
      primaryStrut,
      leftBrace,
      rightBrace,
    });
  }

  const tmpStart = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();
  const tmpDelta = new THREE.Vector3();

  function orientStrut(mesh, start, end) {
    tmpDelta.subVectors(end, start);
    const len = tmpDelta.length();
    mesh.position.copy(start);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(upVec, tmpDelta.normalize());
  }

  function updateLegKinematics(suspensionDip) {
    for (let i = 0; i < legAssemblies.length; i++) {
      const leg = legAssemblies[i];
      tmpStart.set(leg.footPos.x, leg.footPos.y + 0.08, leg.footPos.z);

      // Primary oleo strut attaches to upper descent stage ring (moves with chassis dip)
      tmpEnd.set(leg.dirX * 1.66, 2.38 - suspensionDip, leg.dirZ * 1.66);
      orientStrut(leg.primaryStrut, tmpStart, tmpEnd);

      // Left & right A-frame drag braces attach to lower thrust ring
      tmpEnd.set(
        leg.dirX * 1.78 + leg.tangentX * 0.52,
        1.28 - suspensionDip,
        leg.dirZ * 1.78 + leg.tangentZ * 0.52
      );
      orientStrut(leg.leftBrace, tmpStart, tmpEnd);

      tmpEnd.set(
        leg.dirX * 1.78 - leg.tangentX * 0.52,
        1.28 - suspensionDip,
        leg.dirZ * 1.78 - leg.tangentZ * 0.52
      );
      orientStrut(leg.rightBrace, tmpStart, tmpEnd);
    }
  }

  updateLegKinematics(0);

  function update(state, t) {
    const { altitude, throttle, suspensionDip, rcsActive, tiltX, tiltZ } = state;

    root.position.set(0, altitude, 0);
    root.rotation.set(tiltX, 0.28, tiltZ);

    chassis.position.y = -suspensionDip;
    updateLegKinematics(suspensionDip);

    // Update main engine plume & bell glow
    plume.outerMat.uniforms.uTime.value = t;
    plume.outerMat.uniforms.uThrottle.value = throttle;
    plume.innerMat.uniforms.uTime.value = t;
    plume.innerMat.uniforms.uThrottle.value = throttle;
    plume.group.visible = throttle > 0.002;

    const flicker = 0.92 + 0.16 * Math.sin(t * 43.0) * Math.cos(t * 29.0);
    engineBellMat.emissiveIntensity = throttle * 2.1 * flicker;
    engineLight.intensity = throttle * 11.5 * flicker;

    // Navigation beacon pulse
    const beaconPulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    navBeaconMat.emissiveIntensity = 1.6 + beaconPulse * 1.8;

    // Subtle RCS attitude control bursts during descent & burn
    for (let i = 0; i < rcsPuffs.length; i++) {
      const puff = rcsPuffs[i];
      const wave = Math.sin(t * 17.0 + i * 2.1) * Math.cos(t * 11.0 - i * 1.4);
      const activeFactor = rcsActive * Math.max(0, wave - 0.25) * 1.35;
      puff.material.opacity = Math.min(0.65, activeFactor * 0.55);
      puff.scale.setScalar(0.65 + activeFactor * 0.55);
      puff.visible = puff.material.opacity > 0.01;
    }
  }

  function dispose() {
    hullTex.dispose();
    foilNormal.dispose();
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  return {
    root,
    chassis,
    update,
    dispose,
  };
}
