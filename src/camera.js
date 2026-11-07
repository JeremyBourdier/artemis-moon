import * as THREE from 'three';

function smootherstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createCameraRig() {
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.15,
    800
  );

  const posKeyframes = [
    // t = 0.0: High descent tracking shot looking slightly up at the lander against stars & Earth
    { t: 0.0, pos: new THREE.Vector3(16.5, 19.5, 22.0), lookOffset: new THREE.Vector3(-1.2, 2.8, -4.0), fov: 42 },
    // t = 4.0: Sweeping lower as main engine ignites
    { t: 4.0, pos: new THREE.Vector3(13.2, 9.2, 16.8), lookOffset: new THREE.Vector3(-0.8, 1.8, -2.5), fov: 44 },
    // t = 8.5: Low dramatic burn angle showcasing bright plume & radial dust sheet
    { t: 8.5, pos: new THREE.Vector3(9.4, 2.35, 11.8), lookOffset: new THREE.Vector3(-0.5, 1.9, -1.5), fov: 46 },
    // t = 11.5: Close touchdown angle capturing footpad contact & oleo strut compression
    { t: 11.5, pos: new THREE.Vector3(7.6, 1.55, 10.2), lookOffset: new THREE.Vector3(-1.1, 2.4, -3.5), fov: 41 },
    // t = 14.0: Engine cutoff & settle transition into hero composition
    { t: 14.0, pos: new THREE.Vector3(6.4, 2.15, 12.6), lookOffset: new THREE.Vector3(-4.2, 4.6, -16.0), fov: 38 },
    // t = 18.0: Quiet monumental hero shot — lander on the left third, Earth clear on the right
    { t: 18.0, pos: new THREE.Vector3(9.6, 3.1, 19.4), lookOffset: new THREE.Vector3(1.4, 5.4, -21.0), fov: 38 },
  ];

  const currentPos = new THREE.Vector3();
  const currentTarget = new THREE.Vector3();

  function update(state, t) {
    const clampedT = THREE.MathUtils.clamp(t, 0, 18.0);

    let k0 = posKeyframes[0];
    let k1 = posKeyframes[posKeyframes.length - 1];
    for (let i = 0; i < posKeyframes.length - 1; i++) {
      if (clampedT >= posKeyframes[i].t && clampedT <= posKeyframes[i + 1].t) {
        k0 = posKeyframes[i];
        k1 = posKeyframes[i + 1];
        break;
      }
    }

    const span = Math.max(0.0001, k1.t - k0.t);
    const alpha = smootherstep(0, 1, (clampedT - k0.t) / span);

    currentPos.lerpVectors(k0.pos, k1.pos, alpha);

    // Target tracks lander altitude smoothly during descent and transitions to fixed hero framing
    const landerTrackWeight = 1.0 - smootherstep(9.5, 14.2, clampedT);
    const baseTargetY = state.altitude * landerTrackWeight;

    currentTarget.lerpVectors(k0.lookOffset, k1.lookOffset, alpha);
    currentTarget.y += baseTargetY;

    // Subtle procedural high-frequency camera vibration during main engine burn & touchdown blast
    const shakeAmp = state.cameraShake * 0.11;
    if (shakeAmp > 0.0001) {
      const sx =
        Math.sin(clampedT * 37.0) * 0.55 +
        Math.cos(clampedT * 61.0) * 0.35 +
        Math.sin(clampedT * 97.0) * 0.1;
      const sy =
        Math.cos(clampedT * 43.0) * 0.55 +
        Math.sin(clampedT * 73.0) * 0.35 +
        Math.cos(clampedT * 109.0) * 0.1;
      const sz = Math.sin(clampedT * 53.0) * 0.4;

      currentPos.x += sx * shakeAmp;
      currentPos.y += sy * shakeAmp;
      currentPos.z += sz * shakeAmp * 0.5;

      currentTarget.x += sy * shakeAmp * 0.65;
      currentTarget.y += sx * shakeAmp * 0.65;
    }

    // Prevent camera from ever dipping below local terrain height
    currentPos.y = Math.max(0.85, currentPos.y);

    const newFov = THREE.MathUtils.lerp(k0.fov, k1.fov, alpha);
    if (Math.abs(camera.fov - newFov) > 0.01) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
    }

    camera.position.copy(currentPos);
    camera.lookAt(currentTarget);
  }

  function resize(width, height) {
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  return {
    camera,
    update,
    resize,
  };
}
