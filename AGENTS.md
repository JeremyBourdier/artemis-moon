# AGENTS.md — Artemis Moon Landing

Instrucciones para agentes (OpenCode / Hermes) que trabajen en este repo.

## Contexto

Demo visual: animación three.js procedural del aterrizaje lunar de Artemis.
Objetivo: que se vea cinematográfica, no que sea una librería reutilizable.

## Reglas duras

1. **Cero assets externos.** Nada de CDN, URLs de texturas, GLTF ni HDRIs remotos.
   Todo procedural (`CanvasTexture`, `DataTexture`, shaders inline).
2. **Un solo reloj.** `THREE.Clock` en `main.js`. Ningún módulo crea su propio loop.
3. **Determinismo para tests.** `?static=1&t=N` debe rendear un frame y parar.
   No rompas `window.__SCENE_READY__` ni `window.__ARTEMIS__`.
4. **Sin OrbitControls.** La cámara es coreografía con easing, no interactiva.
5. **Presupuesto de rendimiento.** 60 fps en GPU de laptop; `devicePixelRatio`
   limitado a 2. Si añades algo caro, degrada en móvil.
6. **Sin errores de consola.** El test e2e falla si aparece un `console.error`
   o un `pageerror`. Si three avisa de algo deprecado, se arregla, no se ignora.

## Flujo de trabajo

```bash
npm run dev        # iterar
npm run build      # debe pasar antes de commitear
npm run test:e2e   # debe pasar antes de commitear
```

Commits en imperativo y con alcance: `feat(dust): ...`, `fix(camera): ...`,
`perf(moon): ...`.

## Fases del timeline

`descent` → `burn` → `touchdown` → `settle` → `hero`, ~18 s en loop.
Los tiempos viven en `src/main.js`; si los cambias, actualiza los `t=` del test
en `tests/e2e.spec.js` y la tabla del README.

## Trampas conocidas

- El bloom sobre todo el frame mata el contraste: aplicarlo solo a emissive.
- El polvo con `Points` necesita `depthWrite: false` y `AdditiveBlending` suave,
  si no se ve como confeti.
- Los cráteres deben ser *displacement sobre el plano*, no mallas sueltas: si no,
  las sombras del sol bajo delatan el truco.
- `preserveDrawingBuffer` no hace falta; las capturas van por Playwright, no por
  `canvas.toDataURL()`.
