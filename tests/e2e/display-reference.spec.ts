import { test, expect } from '@playwright/test';

test('display reference hierarchy keeps a dominant clock and open side times', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.clock.install({ time: new Date('2026-10-07T16:44:56Z') });
  await page.clock.pauseAt(new Date('2026-10-07T16:44:56Z'));
  const content = await (await page.request.get('/data/v1/site.json')).json();
  const campus = content.campuses[0];
  campus.timezone = 'America/New_York';
  campus.timetable = [{ date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45', iqamah: { fajr: '06:10' } }];
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  await page.goto(`/display/?campus=${campus.id}`);
  const clock = page.locator('[data-display-clock]');
  await expect(clock).toHaveText('12:44:56 PM');
  await expect(clock).toHaveAttribute('aria-label', '12:44:56 PM');
  const size = (selector: string) => page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(await size('[data-clock-main]')).toBeGreaterThan((await size('[data-clock-seconds]')) * 2);
  expect(await size('[data-clock-main]')).toBeGreaterThan((await size('[data-clock-period]')) * 2);
  await expect(page.locator('[data-iqamah="fajr"]')).toHaveText('6:10 AM');
  for (const panel of ['.sunrise-panel', '.jumuah-panel']) {
    await expect(page.locator(panel)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator(panel)).toHaveCSS('border-top-width', '0px');
  }
  const cards = page.locator('[data-prayer-card]');
  await expect(cards).toHaveCount(5);
  await expect(page.locator('[data-prayer-card][data-prayer-state="next"]')).toHaveCount(1);
  const metrics = await cards.evaluateAll(nodes => nodes.map(node => {
    const s = getComputedStyle(node), box = node.getBoundingClientRect();
    return { y: box.y, bottom: box.bottom, state: node.getAttribute('data-prayer-state'), background: s.backgroundColor, border: s.borderColor };
  }));
  expect(new Set(metrics.map(m => m.y)).size).toBe(1);
  expect(Math.max(...metrics.map(m => m.bottom))).toBeLessThanOrEqual(768);
  const ordinary = metrics.find(m => m.state === 'upcoming')!;
  const current = metrics.find(m => m.state === 'current')!;
  expect(current.background).toBe(ordinary.background);
  expect(current.border).toBe(ordinary.border);
  for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    expect(await size(`[data-prayer="${key}"]`)).toBeGreaterThanOrEqual(44);
    expect(await size(`[data-prayer="${key}"] .time-period`)).toBeLessThan((await size(`[data-prayer="${key}"]`)) / 2);
  }
  await expect(page.locator('.prayer-name').first()).toHaveCSS('border-bottom-width', '0px');
  await expect(page.locator('.iqamah-row').first()).toHaveCSS('border-top-width', '0px');
  await page.clock.runFor(1000);
  await expect(clock).toHaveText('12:44:57 PM');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
