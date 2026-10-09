import { test, expect, type Page } from '@playwright/test';

async function prayerFixture(page: Page) {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  content.organization.name = 'Test Islamic Centre';
  content.organization.theme = { accent: '#245b4a', background: '#eee8dc' };
  content.campuses[0].timetable = [
    { date: '2026-10-07', fajr: '05:43', sunrise: '06:58', dhuhr: '12:45', asr: '15:56', maghrib: '18:30', isha: '19:45' },
    { date: '2026-10-08', fajr: '05:44', sunrise: '06:59', dhuhr: '12:45', asr: '15:55', maghrib: '18:28', isha: '19:43' },
  ];
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  return content;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
  await page.clock.install({ time: new Date('2026-10-07T16:44:55Z') });
  await page.clock.pauseAt(new Date('2026-10-07T16:44:56Z'));
});

test('homepage prayer section has live countdown and accessible prayer cards', async ({ page }) => {
  const content = await prayerFixture(page);
  await page.goto('/');
  const prayer = page.locator('#prayer');
  await expect(prayer.getByRole('timer')).toHaveText('00:00:04');
  await expect(prayer.locator('.web-prayer-board')).toBeVisible();
  const cards = prayer.getByRole('listitem');
  await expect(cards).toHaveCount(6);
  for (const name of ['Fajr', 'Shuruq', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) await expect(prayer.getByRole('listitem', { name: new RegExp(`^${name}`) })).toBeVisible();
  const shuruq = prayer.locator('[data-prayer-card="sunrise"]');
  await expect(shuruq).toContainText('Shuruq');
  await expect(shuruq).toContainText('06:58');
  await expect(shuruq).not.toContainText('Iqamah');
  await expect(prayer.locator('[data-website-jumuah]')).toContainText('Jumuah');
  await expect(prayer.getByRole('listitem', { name: /^Fajr/ })).toContainText('Adhan');
  await expect(prayer.getByRole('listitem', { name: /Fajr.*Adhan.*05:43.*Iqamah/s })).toBeVisible();
  await expect(prayer.getByRole('listitem', { name: /^Dhuhr/ })).toHaveAttribute('data-prayer-state', 'next');
  await expect(prayer.getByRole('listitem', { name: /^Fajr/ })).toHaveAttribute('data-prayer-state', 'current');
  expect(await prayer.evaluate(el => getComputedStyle(el).getPropertyValue('--prayer-accent').trim())).toBe(content.organization.theme.accent);
  await expect(prayer).toHaveCSS('background-color', 'rgb(246, 244, 237)');
  await expect(shuruq).not.toContainText(/sunrise|iqamah/i);
  await page.clock.runFor(1_000);
  await expect(prayer.getByRole('timer')).toHaveText('00:00:03');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('display is a themed full-screen TV view with five prayer cards and Shuruq', async ({ page }) => {
  const content = await prayerFixture(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/display/?campus=demo-central');
  await expect(page.locator('.site-header, .footer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Test Islamic Centre' })).toBeVisible();
  await expect(page.locator('[data-display-clock]')).toHaveText('12:44:56 PM');
  await expect(page.getByRole('timer')).toHaveText('00:00:04');
  const prayerCards = page.locator('.display-prayers > li');
  await expect(prayerCards).toHaveCount(5);
  await expect(page.locator('[data-sunrise-panel]')).toContainText('Shuruq');
  await expect(page.locator('[data-sunrise-panel]')).toContainText('6:58 AM');
  await expect(page.locator('[data-sunrise-panel]')).not.toContainText(/sunrise|iqamah/i);
  await expect(page.getByRole('listitem', { name: /^Fajr/ })).toContainText('Adhan');
  await expect(page.getByRole('listitem', { name: /Fajr.*Adhan.*5:43 AM.*Iqamah/s })).toBeVisible();
  const boxes = await prayerCards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()));
  expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(1);
  expect(Math.min(...boxes.map(box => box.width))).toBeGreaterThan(190);
  for (const box of boxes) expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  const hero = await page.locator('.time-hero').boundingBox();
  expect(hero).not.toBeNull();
  expect(Math.abs((hero!.x + hero!.width / 2) - 1366 / 2)).toBeLessThan(2);
  await expect(page.locator('[data-prayer-card="dhuhr"]')).toHaveAttribute('data-prayer-state', 'next');
  await expect(page.locator('[data-prayer-card="fajr"]')).toHaveAttribute('data-prayer-state', 'current');
  await expect(page.getByText('First gathering', { exact: false })).toBeVisible();
  expect(parseFloat(await page.locator('[data-prayer="fajr"]').evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(44);
  expect(await page.locator('[data-jumuah] > span').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
  expect(await page.locator('.display-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--display-accent').trim())).toBe(content.organization.theme.accent);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.clock.runFor(1_000);
  await expect(page.locator('[data-display-clock]')).toHaveText('12:44:57 PM');
  await expect(page.getByRole('timer')).toHaveText('00:00:03');
});

for (const route of ['/', '/display/']) {
  test(`${route} uses consistent glass with only the next salah emphasized`, async ({ page }) => {
    await prayerFixture(page);
    await page.goto(route);
    const root = page.locator(route === '/' ? '#prayer' : '.display-shell');
    await expect(root.locator('[data-prayer-card="dhuhr"]')).toHaveAttribute('data-prayer-state', 'next');
    const styles = await root.locator('[data-prayer-card]').evaluateAll(nodes => nodes.map(node => {
      const s = getComputedStyle(node);
      return { state: node.getAttribute('data-prayer-state'), background: s.backgroundColor,
        image: s.backgroundImage, border: s.borderColor, shadow: s.boxShadow,
        before: getComputedStyle(node, '::before').content };
    }));
    const ordinary = styles.find(s => s.state === 'upcoming')!;
    const current = styles.find(s => s.state === 'current')!;
    expect({ ...current, state: 'upcoming' }).toEqual(ordinary);
    for (const style of styles) {
      expect(['none', 'normal']).toContain(style.before);
      expect(style.image).toBe('none');
      // Chromium preserves color-mix as color(srgb … / alpha), not rgba().
      const alpha = Number(style.background.match(/(?:,\s*|\/\s*)([\d.]+)\)$/)?.[1] ?? 1);
      expect(alpha).toBeLessThanOrEqual(.3);
      expect(alpha).toBeGreaterThan(0);
    }
    expect(styles.find(s => s.state === 'next')!.border).not.toBe(ordinary.border);
    const sizes = await root.locator('[data-prayer-card] [data-prayer], [data-prayer-card] [data-iqamah]').evaluateAll(nodes => nodes.map(n => parseFloat(getComputedStyle(n).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(route === '/' ? 24 : 44);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Capture visuals separately: screenshots can stall with a paused browser clock.
  });
}

test('display query campus overrides storage and fetched JSON updates its timetable', async ({ page }) => {
  const content = await prayerFixture(page);
  const second = content.campuses[1];
  second.timetable = [{ date: '2026-10-07', fajr: '04:01', sunrise: '05:22', dhuhr: '11:33', asr: '14:44', maghrib: '17:55', isha: '19:06' }];
  await page.goto(`/display/?campus=${second.id}`);
  await expect(page.locator('[data-campus-name]')).toHaveText(second.name);
  await expect(page.getByRole('listitem', { name: /^Fajr/ })).toContainText('4:01 AM');
  expect(await page.evaluate(() => localStorage.getItem('openmasjid-campus'))).toBe(second.id);
});

test('display retains Shuruq milestone semantics without a second visual highlight', async ({ page }) => {
  const content = await prayerFixture(page);
  content.campuses[0].timetable[0].sunrise = '12:45';
  content.campuses[0].timetable[0].dhuhr = '13:00';
  await page.goto('/display/?campus=demo-central');
  const shuruq = page.locator('[data-sunrise-panel]');
  await expect(shuruq).toHaveAttribute('data-prayer-state', 'next');
  await expect(page.locator('[data-next-name]')).toHaveText('Dhuhr');
  await expect(shuruq).toHaveCSS('outline-style', 'none');
});

test('display fits three Jumuah gatherings inside the side panel', async ({ page }) => {
  const content = await prayerFixture(page);
  content.campuses[0].jumuah.push({ label: 'Third gathering', time: '15:15' });
  await page.setViewportSize({ width: 1280, height: 633 });
  await page.goto('/display/?campus=demo-central');
  await expect(page.locator('[data-jumuah] > span')).toHaveCount(3);
  expect(await page.locator('.jumuah-panel').evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
  expect(await page.locator('[data-jumuah]').evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
});

test('display stays overflow-free on a narrow screen and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prayerFixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/display/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.display-shell')).toHaveCSS('animation-name', 'none');
});