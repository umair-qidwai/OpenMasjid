import { test, expect } from '@playwright/test';

test('square prayer boards and a continuous rounded clock fit target viewports', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[1366, 768], [1280, 633]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/display/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-display-clock]')).not.toHaveText('--:--:--');
    const cards = await page.locator('.display-prayers > li').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { width: r.width, height: r.height, bottom: r.bottom, fits: n.scrollWidth <= n.clientWidth && n.scrollHeight <= n.clientHeight };
    }));
    for (const card of cards) {
      expect(Math.abs(card.width - card.height)).toBeLessThan(1);
      expect(card.fits).toBe(true);
      expect(card.bottom).toBeLessThanOrEqual(height);
    }
    const clock = page.locator('.time-stack');
    await expect(clock).toHaveCSS('overflow', 'hidden');
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) await expect(clock).toHaveCSS(`border-${corner}-radius`, '32px');
    expect(await page.locator('.display-prayers strong').evaluateAll(nodes => nodes.every(n => parseFloat(getComputedStyle(n).fontSize) >= 44))).toBe(true);
    expect(await page.locator('.display-shell').evaluate(n => getComputedStyle(n, '::before').backgroundImage)).toContain('mosque-pattern.svg');
    await page.screenshot({ path: `/tmp/openmasjid-polished-display-${width}.png` });
  }
  for (const [width, height] of [[1366, 900], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#campus-name')).not.toBeEmpty();
    await page.locator('#prayer').scrollIntoViewIfNeeded();
    const cards = await page.locator('#schedule > li').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { width: r.width, height: r.height, fits: n.scrollWidth <= n.clientWidth && n.scrollHeight <= n.clientHeight };
    }));
    for (const card of cards) { expect(Math.abs(card.width - card.height)).toBeLessThan(1); expect(card.fits).toBe(true); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.prayer-panel').screenshot({ path: `/tmp/openmasjid-polished-home-${width}.png` });
  }
});
