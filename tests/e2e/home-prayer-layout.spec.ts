import { test, expect } from '@playwright/test';

test('homepage uses a centered countdown and six-card prayer grid with full-width Jumuah', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
  await page.clock.install({ time: new Date('2026-10-07T16:44:00Z') });
  await page.clock.pauseAt(new Date('2026-10-07T16:44:56Z'));
  const content = await (await page.request.get('/data/v1/site.json')).json();
  content.campuses[0].timetable = [{ date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45', iqamah: { fajr: '06:10' } }];
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const prayer = page.locator('#prayer');
  await expect(prayer.locator('[data-prayer-card]')).toHaveCount(6);
  expect(await prayer.locator('[data-prayer-card]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-prayer-card')))).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
  await expect(prayer.locator('#next-time, [data-website-sunrise]')).toHaveCount(0);
  await expect(prayer.locator('#next-name')).toHaveText('Dhuhr');
  await expect(prayer.getByRole('timer')).toHaveText('00:00:04');
  await expect(prayer.locator('[data-prayer-card="sunrise"]')).not.toContainText(/iqamah|sunrise|adhan/i);
  await expect(prayer.locator('[data-iqamah="fajr"]')).toHaveText('06:10');
  await expect(prayer.locator('[data-prayer-state="next"]')).toHaveCount(1);
  const boxes = await prayer.locator('[data-prayer-card]').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width }; }));
  const columns = (page.viewportSize()?.width ?? 0) > 600 ? 3 : 2;
  expect(new Set(boxes.slice(0, columns).map(b => b.y)).size).toBe(1);
  expect(boxes[columns].y).toBeGreaterThan(boxes[0].y);
  const grid = (await prayer.locator('#schedule').boundingBox())!;
  const jumuah = (await prayer.locator('#jumuah').boundingBox())!;
  expect(Math.abs(grid.width - jumuah.width)).toBeLessThan(2);
  expect(jumuah.y).toBeGreaterThanOrEqual(grid.y + grid.height);
  const lead = (await prayer.locator('.prayer-lead').boundingBox())!;
  for (const selector of ['#next-name', '.countdown-label']) {
    const box = (await prayer.locator(selector).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - lead.x - lead.width / 2)).toBeLessThan(2);
  }
  const dimensions = await prayer.locator('[data-prayer-card]').evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height, fits: n.scrollHeight <= n.clientHeight && n.scrollWidth <= n.clientWidth })));
  for (const card of dimensions) {
    expect(card.fits).toBe(true);
    expect(Math.abs(card.width - card.height)).toBeLessThan(1);
    if (columns === 3) {
      expect(card.width).toBeLessThanOrEqual(260);
    }
  }
  const meta = await prayer.locator('.prayer-meta').evaluate(el => {
    const campus = el.querySelector('#campus-name')!, date = el.querySelector('#today')!;
    return { font: parseFloat(getComputedStyle(el).fontSize), width: el.getBoundingClientRect().width, gap: date.getBoundingClientRect().left - campus.getBoundingClientRect().right };
  });
  expect(meta.font).toBeGreaterThanOrEqual(16);
  if (columns === 3) expect(meta.gap).toBeGreaterThan(200);
  expect(lead.height).toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
