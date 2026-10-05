import { test, expect } from '@playwright/test';

test('top campus selection keeps every contact card and scopes content', async ({ page }) => {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  const [first, second] = content.campuses;
  content.events = [first, second].map((campus, i) => ({ ...content.events[0], id: `event-${i}`, title: `${campus.name} event`, campusIds: [campus.id] }));
  content.announcements = [first, second].map((campus, i) => ({ ...content.announcements[0], id: `news-${i}`, title: `${campus.name} news`, campusIds: [campus.id], publishedAt: '2020-01-01T00:00:00Z', expiresAt: null }));
  second.timetable[0].fajr = '04:12';
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  await page.addInitScript(id => localStorage.setItem('openmasjid-campus', id), second.id);
  await page.goto(`/?campus=${first.id}`);
  await expect(page.locator('#campus')).toHaveValue(first.id);
  await expect(page.locator('.site-header #campus')).toHaveAttribute('aria-label', 'Current campus');
  await expect(page.locator('main #campus-form')).toHaveCount(0);
  await expect(page.locator('.campus-switcher')).toContainText(first.name);
  await expect(page.locator('.location-card')).toHaveCount(content.campuses.length);
  await expect(page.getByRole('link', { name: /Plan your visit/ })).toHaveCount(0);
  for (const campus of content.campuses) {
    const card = page.locator('.location-card').filter({ hasText: campus.name });
    await expect(card).toContainText(campus.address);
    await expect(card.getByRole('link', { name: /^Email/ })).toHaveAttribute('href', `mailto:${campus.email}`);
    await expect(card.getByRole('link', { name: /^Call/ })).toHaveAttribute('href', `tel:${campus.phone}`);
    await expect(card.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${campus.address}, ${campus.city}`)}`);
  }
  await page.locator('#campus').selectOption(second.id);
  await expect(page.locator('.location-card')).toHaveCount(content.campuses.length);
  await expect(page.locator('.location-card[data-selected="true"]')).toContainText(second.name);
  await expect(page.locator('#campus-name')).toHaveText(second.name);
  await expect(page.locator('#event-cards')).toContainText(`${second.name} event`);
  await expect(page.locator('#event-cards')).not.toContainText(`${first.name} event`);
  await expect(page.locator('#announcement-cards')).toContainText(`${second.name} news`);
  await expect(page.locator('#announcement-cards')).not.toContainText(`${first.name} news`);
  await page.reload();
  await expect(page.locator('#campus')).toHaveValue(second.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('single campus has one contact card and no visible selector', async ({ page }) => {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  content.campuses = content.campuses.slice(0, 1);
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  await page.goto('/');
  await expect(page.locator('.location-card')).toHaveCount(1);
  await expect(page.locator('#campus-form')).toBeHidden();
  await expect(page.locator('.campus-static')).toHaveText(content.campuses[0].name);
  await expect(page.locator('.location-card')).toContainText('Selected campus');
});
