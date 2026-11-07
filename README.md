# Artemis — Moon Landing

Animación 3D cinematográfica del aterrizaje de Artemis en la Luna, construida con
**three.js** sobre **Vite**. Todo el contenido es procedural: sin assets externos,
sin texturas descargadas, funciona 100 % offline.

## Qué se ve

Timeline de ~18 s en loop, cinco fases:

| Fase | Qué pasa |
|---|---|
| `descent` | Descenso alto, lander recortado contra el cielo negro |
| `burn` | Encendido del motor principal: pluma additive, núcleo turbulento, shake de cámara |
| `touchdown` | Regolito eyectado radialmente, patas contactan, suspensión cede |
| `settle` | Corte de motor, colapso de la pluma, polvo asentándose |
| `hero` | Plano quieto con la Tierra en cuadro |

## Stack

- `three@0.187` — escena, shaders, `EffectComposer` + `UnrealBloomPass`
- `vite` — dev server y build
- `@playwright/test` — pruebas e2e con capturas de frames

## Uso

```bash
npm install
npm run dev        # http://127.0.0.1:5199
npm run build      # dist/
npm run preview    # sirve el build
npm run test:e2e   # Playwright
```

> **Windows / PowerShell 5.1:** `&&` no es un separador válido antes de PowerShell 7.
> Usa una línea por comando, o `;` en lugar de `&&`:
> ```powershell
> cd $HOME\projects\artemis-moon
> npm run dev
> ```
> Con `pwsh` (PowerShell 7+) o Git Bash, `&&` funciona igual que en los ejemplos.

### Parámetros de URL

| Param | Efecto |
|---|---|
| `?t=12` | Salta a ese segundo del timeline |
| `?static=1` | Renderiza un único frame y detiene el loop (captura determinista) |

## API de control

Expuesta en `window.__ARTEMIS__` para pruebas y automatización:

```js
__ARTEMIS__.setPhase('burn');   // descent | burn | touchdown | settle | hero
__ARTEMIS__.getPhase();
__ARTEMIS__.seek(7.5);
__ARTEMIS__.pause();
__ARTEMIS__.resume();
```

`window.__SCENE_READY__ === true` cuando el primer frame ya se dibujó.

## Estructura

```
index.html
src/
  main.js      bootstrap, clock, resize, API pública
  scene.js     renderer, luces, cielo, estrellas
  moon.js      terreno con fBm + cráteres + regolito
  lander.js    HLS estilizado desde primitivas
  dust.js      partículas de regolito con shader propio
  camera.js    coreografía de cámara con easing
  post.js      composer, bloom, grading
tests/
  e2e.spec.js  pruebas Playwright
```

## Pruebas

`npm run test:e2e` levanta el dev server y verifica:

1. La escena arranca y expone la API, sin errores de consola.
2. Recorre las cinco fases y `getPhase()` las refleja.
3. `pause`/`resume`/`seek` se comportan.
4. Los cuatro frames clave renderizan contenido real (no pantalla vacía) y quedan
   adjuntos como PNG en el reporte.

## Convenciones

- ES modules, sin bundler-specific magic.
- Nada de red en runtime: si algo necesita una textura, se genera con `CanvasTexture`.
- Un solo `THREE.Clock` gobierna el loop.
- `dispose()` en `beforeunload` para liberar geometrías, materiales y el renderer.
