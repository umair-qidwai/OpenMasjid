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
  const cards = prayer.getByRole('listitem');
  await expect(cards).toHaveCount(6);
  for (const name of ['Fajr', 'Shuruq', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) await expect(prayer.getByRole('listitem', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(prayer.getByRole('listitem', { name: /^Shuruq/ })).not.toContainText('Iqamah');
  await expect(prayer.getByRole('listitem', { name: /^Fajr/ })).toContainText('Adhan');
  await expect(prayer.getByRole('listitem', { name: /Fajr.*Adhan.*05:43.*Iqamah/s })).toBeVisible();
  await expect(prayer.getByRole('listitem', { name: /^Dhuhr/ })).toHaveAttribute('data-prayer-state', 'next');
  await expect(prayer.getByRole('listitem', { name: /^Fajr/ })).toHaveAttribute('data-prayer-state', 'current');
  expect(await prayer.evaluate(el => getComputedStyle(el).getPropertyValue('--prayer-accent').trim())).toBe(content.organization.theme.accent);
  await expect(prayer).toHaveCSS('background-color', 'rgb(36, 91, 74)');
  await page.clock.runFor(1_000);
  await expect(prayer.getByRole('timer')).toHaveText('00:00:03');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('display is a themed full-screen six-card TV view with a live clock', async ({ page }) => {
  const content = await prayerFixture(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/display/?campus=demo-central');
  await expect(page.locator('.site-header, .footer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Test Islamic Centre' })).toBeVisible();
  await expect(page.locator('[data-display-clock]')).toHaveText('12:44:56');
  await expect(page.getByRole('timer')).toHaveText('00:00:04');
  await expect(page.getByRole('listitem')).toHaveCount(6);
  await expect(page.getByRole('listitem', { name: /^Fajr/ })).toContainText('Adhan');
  await expect(page.getByRole('listitem', { name: /Fajr.*Adhan.*05:43.*Iqamah/s })).toBeVisible();
  const boxes = await page.getByRole('listitem').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()));
  expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(1);
  await expect(page.getByRole('listitem', { name: /^Dhuhr/ })).toHaveAttribute('data-prayer-state', 'next');
  await expect(page.getByRole('listitem', { name: /^Fajr/ })).toHaveAttribute('data-prayer-state', 'current');
  await expect(page.getByText('Shuruq', { exact: true })).toBeVisible();
  await expect(page.getByText('First gathering', { exact: false })).toBeVisible();
  expect(await page.locator('.display-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--display-accent').trim())).toBe(content.organization.theme.accent);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.clock.runFor(1_000);
  await expect(page.locator('[data-display-clock]')).toHaveText('12:44:57');
  await expect(page.getByRole('timer')).toHaveText('00:00:03');
});

test('display query campus overrides storage and fetched JSON updates its timetable', async ({ page }) => {
  const content = await prayerFixture(page);
  const second = content.campuses[1];
  second.timetable = [{ date: '2026-10-07', fajr: '04:01', sunrise: '05:22', dhuhr: '11:33', asr: '14:44', maghrib: '17:55', isha: '19:06' }];
  await page.goto(`/display/?campus=${second.id}`);
  await expect(page.locator('[data-campus-name]')).toHaveText(second.name);
  await expect(page.getByRole('listitem', { name: /^Fajr/ })).toContainText('04:01');
  expect(await page.evaluate(() => localStorage.getItem('openmasjid-campus'))).toBe(second.id);
});

test('display stays overflow-free on a narrow screen and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prayerFixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/display/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.display-shell')).toHaveCSS('animation-name', 'none');
});