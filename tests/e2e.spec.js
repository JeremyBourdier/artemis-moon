import { test, expect } from '@playwright/test';

/**
 * E2E — Artemis Moon Landing (three.js)
 * Verifica: arranque de escena, API de control, fases del timeline,
 * ausencia de errores de consola y capturas de frames clave.
 */

test.describe('Artemis moon landing', () => {
  test('carga la escena sin errores y expone la API', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });

    await page.goto('/');
    await page.waitForFunction(() => window.__SCENE_READY__ === true, null, { timeout: 30_000 });

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(300);
    expect(box.height).toBeGreaterThan(200);

    const api = await page.evaluate(() => Object.keys(window.__ARTEMIS__ || {}));
    expect(api).toEqual(expect.arrayContaining(['setPhase', 'getPhase', 'pause', 'resume', 'seek']));

    expect(errors, `errores en consola:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('recorre todas las fases del timeline', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__SCENE_READY__ === true, null, { timeout: 30_000 });

    for (const phase of ['descent', 'burn', 'touchdown', 'settle', 'hero']) {
      await page.evaluate((p) => window.__ARTEMIS__.setPhase(p), phase);
      await page.waitForTimeout(350);
      const current = await page.evaluate(() => window.__ARTEMIS__.getPhase());
      expect(current, `fase ${phase}`).toBe(phase);
    }
  });

  test('pause/resume y seek funcionan', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__SCENE_READY__ === true, null, { timeout: 30_000 });

    await page.evaluate(() => window.__ARTEMIS__.seek(6));
    await page.evaluate(() => window.__ARTEMIS__.pause());
    const a = await page.evaluate(() => window.__ARTEMIS__.getPhase());
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => window.__ARTEMIS__.getPhase());
    expect(a).toBe(b);

    await page.evaluate(() => window.__ARTEMIS__.resume());
    await page.waitForTimeout(400);
    const running = await page.evaluate(() => window.__ARTEMIS__.getPhase());
    expect(typeof running).toBe('string');
  });

  test('frames clave renderizan contenido (no pantalla vacía)', async ({ page }, testInfo) => {
    const shots = [
      { t: 3, name: 'descent' },
      { t: 7, name: 'burn' },
      { t: 11, name: 'touchdown' },
      { t: 16, name: 'hero' },
    ];

    for (const shot of shots) {
      await page.goto(`/?static=1&t=${shot.t}`);
      await page.waitForFunction(() => window.__SCENE_READY__ === true, null, { timeout: 30_000 });
      await page.waitForTimeout(500);

      const buffer = await page.screenshot();
      expect(buffer.byteLength, `${shot.name} screenshot vacío`).toBeGreaterThan(20_000);

      const path = testInfo.outputPath(`frame-${shot.name}.png`);
      await page.screenshot({ path });
      await testInfo.attach(`frame-${shot.name}`, { path, contentType: 'image/png' });
    }
  });
});
