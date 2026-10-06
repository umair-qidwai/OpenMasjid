import { test, expect } from '@playwright/test';

async function scopedContent(page: import('@playwright/test').Page) {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  const [first, second] = content.campuses;
  content.events = [first, second].map((campus, i) => ({ ...content.events[0], id: `event-${i}`, title: `${campus.name} event`, campusIds: [campus.id] }));
  content.announcements = [first, second].map((campus, i) => ({ ...content.announcements[0], id: `news-${i}`, title: `${campus.name} news`, campusIds: [campus.id], publishedAt: '2020-01-01T00:00:00Z', expiresAt: null }));
  second.timetable[0].fajr = '04:12';
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  return { content, first, second };
}

test('first visit asks once, then Locations owns campus switching', async ({ page }) => {
  const { content, first, second } = await scopedContent(page);
  await page.goto('/');

  await expect(page.locator('.site-header select')).toHaveCount(0);
  await expect(page.locator('.nav a[href="#locations"]')).toHaveText('Locations');
  const dialog = page.getByRole('dialog', { name: 'Choose your location' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(second.name) }).check();
  await dialog.getByRole('button', { name: `Continue with ${second.name}` }).click();

  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('openmasjid-campus'))).toBe(second.id);
  await expect(page.locator('#campus-name')).toHaveText(second.name);
  await expect(page.locator('#event-cards')).toContainText(`${second.name} event`);
  await expect(page.locator('#event-cards')).not.toContainText(`${first.name} event`);
  await expect(page.locator('.location-card')).toHaveCount(content.campuses.length);
  await expect(page.getByRole('heading', { name: 'Locations', exact: true })).toBeVisible();
  await expect(page.locator('.location-card[data-selected="true"]')).toContainText(second.name);

  const firstCard = page.locator('.location-card').filter({ hasText: first.name });
  await firstCard.getByRole('button', { name: `Use ${first.name}` }).click();
  await expect(page.locator('#campus-name')).toHaveText(first.name);
  await expect(page.locator('.location-card[data-selected="true"]')).toContainText(first.name);
  expect(await page.evaluate(() => localStorage.getItem('openmasjid-campus'))).toBe(first.id);
  await page.reload();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#campus-name')).toHaveText(first.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('saved campus skips the first-visit dialog and keeps contact actions', async ({ page }) => {
  const { content, second } = await scopedContent(page);
  await page.addInitScript(id => localStorage.setItem('openmasjid-campus', id), second.id);
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Choose your location' })).toBeHidden();
  await expect(page.locator('#campus-name')).toHaveText(second.name);
  for (const campus of content.campuses) {
    const card = page.locator('.location-card').filter({ hasText: campus.name });
    await expect(card).toContainText(campus.address);
    await expect(card.getByRole('link', { name: new RegExp(`Email ${campus.name}`) })).toHaveAttribute('href', `mailto:${campus.email}`);
    await expect(card.getByRole('link', { name: new RegExp(`Call ${campus.name}`) })).toHaveAttribute('href', `tel:${campus.phone}`);
    await expect(card.getByRole('link', { name: new RegExp(`Email ${campus.name}`) })).toHaveText(campus.email);
    await expect(card.getByRole('link', { name: new RegExp(`Call ${campus.name}`) })).toHaveText(campus.phone);
    await expect(card.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${campus.address}, ${campus.city}`)}`);
  }
});

test('single-campus sites show one location without prompting or switching controls', async ({ page }) => {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  content.campuses = content.campuses.slice(0, 1);
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Choose your location' })).toBeHidden();
  await expect(page.locator('.location-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
  await expect(page.locator('.location-card')).toContainText('Current location');
  await expect(page.locator('.location-card').getByRole('button', { name: /Use/ })).toHaveCount(0);
});
