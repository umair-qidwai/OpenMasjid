import { test, expect } from '@playwright/test';

const screenshot = async (page: import('@playwright/test').Page, name: string) => {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: (page.viewportSize()?.width ?? 0) > 600 });
};

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))).toEqual(expect.objectContaining({ body: expect.any(Number), viewport: expect.any(Number) }));
  expect(await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test.describe('public site browser UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
  });

  test('loads the published fictional JSON and renders prayer/Jumuah content', async ({ page }) => {
    const jsonResponse = await page.request.get('/data/v1/site.json');
    await page.goto('/');
    await expect(page).toHaveTitle(/OpenMasjid/);
    await expect(page.locator('.site-header .brand')).toBeVisible();
    await expect(page.getByText('First gathering · 13:15')).toBeVisible();
    await expect(page.getByText('Second gathering · 14:15')).toBeVisible();
    await expect(page.locator('.site-header').getByRole('link', { name: 'Donate' })).toHaveAttribute('href', /donate\/$/);
    await expect(page.getByRole('link', { name: /Admin|Publisher admin/i })).toHaveCount(0);
    for (const heading of ['Prayer times', 'Programs', 'Services', 'Upcoming events', 'Announcements', 'Locations']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    expect(jsonResponse.status()).toBe(200);
    await screenshot(page, 'public-home');
  });

  test('changes campus and updates the displayed campus', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Use Riverside · Fictional Demo' }).click();
    await expect(page.locator('.prayer-panel')).toContainText('Riverside · Fictional Demo');
    await expect(page).toHaveURL(/campus=demo-riverside/);
    await page.reload();
    await expect(page.locator('.location-card[data-selected="true"]')).toContainText('Riverside · Fictional Demo');
    await expect(page.locator('.prayer-panel')).toContainText('Riverside · Fictional Demo');
    await screenshot(page, 'public-riverside');
  });

  test('has event and announcement filter controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Announcements' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Events' })).toBeVisible();
    await page.getByRole('button', { name: 'Announcements' }).click();
    await expect(page.locator('#community-cards [data-kind="event"]')).toBeHidden();
    await page.getByRole('button', { name: 'Events' }).click();
    await expect(page.locator('#community-cards [data-kind="announcement"]')).toBeHidden();
  });

  test('scopes community content to the selected campus', async ({ page }) => {
    const response = await page.request.get('/data/v1/site.json');
    const content = await response.json();
    content.events.push({
      id: 'riverside-event', title: 'Riverside fictional gathering', description: 'Riverside only',
      startsAt: '2026-10-04T11:00:00-04:00', endsAt: '2026-10-04T13:00:00-04:00',
      campusIds: ['demo-riverside'], location: 'Riverside hall', category: 'Community',
    });
    content.announcements.push({
      id: 'central-news', title: 'Central fictional notice', body: 'Central only',
      campusIds: ['demo-central'], publishedAt: '2026-10-01T00:00:00Z', expiresAt: null,
    });
    await page.route('**/data/v1/site.json', (route) => route.fulfill({ json: content }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Use Riverside · Fictional Demo' }).click();
    await expect(page.locator('#community-cards [data-kind="event"]').filter({ hasText: 'Riverside fictional gathering' })).toBeVisible();
    await expect(page.locator('#community-cards').getByRole('heading', { name: 'Central fictional notice' })).toHaveCount(0);
  });

  test('honors reduced motion and remains overflow-free', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    await assertNoHorizontalOverflow(page);
    await screenshot(page, 'public-reduced-motion');
  });

  test('reports no uncaught console exceptions', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(exceptions).toEqual([]);
  });

  test('uses the configured logo for header, footer and favicon', async ({ page }) => {
    const response = await page.request.get('/data/v1/site.json');
    const content = await response.json();
    content.organization.logo = 'https://cdn.example.org/masjid-logo';
    await page.route('**/data/v1/site.json', route => route.fulfill({ json: content }));
    await page.goto('/');
    await expect(page.locator('[data-site-logo]')).toHaveCount(3);
    for (const logo of await page.locator('[data-site-logo]').all()) await expect(logo).toHaveAttribute('src', content.organization.logo);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', content.organization.logo);
  });
});

test.describe('donation page', () => {
  test('shows a safe empty state by default', async ({ page }) => {
    await page.goto('/donate/');
    await expect(page.getByRole('heading', { name: 'Giving, made simple.' })).toBeVisible();
    await expect(page.getByText('Online giving is not configured yet.')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('renders custom markup only in an opaque sandboxed iframe', async ({ page }) => {
    const response = await page.request.get('/data/v1/site.json');
    const content = await response.json();
    content.donation = { mode: 'custom', externalUrl: null, customHtml: '<main id="embedded-donation"><h2>Trusted form</h2><script>parent.document.body.dataset.compromised="yes"</script></main>' };
    await page.route('**/data/v1/site.json', (route) => route.fulfill({ json: content }));
    await page.goto('/donate/');
    const frame = page.locator('iframe[title="Donation form"]');
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(page.locator('#embedded-donation')).toHaveCount(0);
    await expect(frame.contentFrame().getByRole('heading', { name: 'Trusted form' })).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-compromised', 'yes');
  });
});

test.describe('admin editor browser UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Shape your community\'s front door.' })).toBeVisible();
  });

  test('previews a directly selected organization logo and lets the admin cancel it', async ({ page }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaGD4DwAChAGA+gVWHQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('#logo-upload').setInputFiles({ name: 'masjid-logo.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('#logo-upload-status')).toContainText('masjid-logo.png selected');
    await expect(page.locator('#editor-message')).toContainText('New logo ready to publish');
    const selectedPreview = await page.locator('#logo-preview').getAttribute('src');
    expect(selectedPreview).toMatch(/^blob:/);
    await expect(page.locator('#cancel-logo-upload')).toBeVisible();

    await page.locator('#logo-upload').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await expect(page.locator('#logo-upload-status')).toContainText('valid PNG, JPEG, or WebP');
    await expect(page.locator('#logo-preview')).toHaveAttribute('src', selectedPreview!);
    await expect(page.locator('#cancel-logo-upload')).toBeVisible();

    await page.getByText('Use an existing image URL or asset path instead').click();
    await page.getByLabel('Logo location').fill('https://cdn.example.org/new-logo.png');
    await expect(page.locator('#cancel-logo-upload')).toBeHidden();
    await expect(page.locator('#logo-upload-status')).toContainText('Upload cancelled');
  });

  test('configures an HTTPS donation destination in the local draft', async ({ page }) => {
    await page.getByRole('button', { name: 'Giving' }).click();
    await page.getByLabel('Donation mode').selectOption('external');
    await page.getByLabel('External donation URL').fill('https://give.example.org/openmasjid');
    await page.getByRole('button', { name: 'Save local draft' }).click();
    await expect(page.locator('#editor-message')).toContainText('Saved locally');
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('openmasjid-draft') || '{}'));
    expect(draft.donation).toEqual({ mode: 'external', externalUrl: 'https://give.example.org/openmasjid', customHtml: '' });
  });

  test('creates card-only and details-enabled programs and services', async ({ page }) => {
    await page.getByRole('button', { name: 'Programs & services' }).click();
    await page.getByRole('button', { name: '+ Program' }).click();
    await page.getByRole('button', { name: '+ Service' }).click();
    const newProgram = page.locator('#program-editor .content-card').last();
    const newService = page.locator('#service-editor .content-card').last();
    await newProgram.locator('[data-path$=".title"]').fill('Youth circle');
    await newProgram.locator('[data-path$=".details.enabled"]').check();
    await newProgram.locator('[data-path$=".details.content"]').fill('A welcoming weekly youth circle.');
    await newProgram.getByLabel('Specific campuses').check();
    await newProgram.getByLabel('Riverside · Fictional Demo').check();
    await newService.locator('[data-path$=".title"]').fill('Family support');
    await page.locator('#service-editor .content-card').first().getByRole('button', { name: 'Delete service' }).click();
    await page.getByRole('button', { name: 'Save local draft' }).click();
    await expect(page.locator('#editor-message')).toContainText('Saved locally');
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('openmasjid-draft') || '{}'));
    expect(draft.programs.at(-1).details).toEqual({ enabled: true, content: 'A welcoming weekly youth circle.' });
    expect(draft.programs.at(-1).campusIds).toEqual(['demo-riverside']);
    expect(draft.services.at(-1).details).toEqual({ enabled: false, content: '' });
    expect(draft.services.some((service: { title: string }) => service.title === 'Prayer & reflection')).toBe(false);
  });

  test('edits and removes a real event and announcement locally', async ({ page }) => {
    await page.getByRole('button', { name: 'Events & news' }).click();
    const eventTitle = page.locator('[data-path="events.0.title"]');
    await eventTitle.fill('Edited fictional event');
    await page.getByRole('button', { name: '+ Event' }).click();
    await expect(page.locator('#content-editor .content-card')).toHaveCount(3);
    await page.locator('[data-kind="event"]').last().click();
    await expect(page.locator('#content-editor .content-card')).toHaveCount(2);
    await page.getByRole('button', { name: '+ Announcement' }).click();
    await expect(page.locator('#content-editor .content-card')).toHaveCount(3);
    await page.locator('[data-kind="announcement"]').last().click();
    await expect(page.locator('#content-editor .content-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Save local draft' }).click();
    await expect(page.locator('#editor-message')).toContainText('Saved locally');
    await expect(page.locator('#save-status')).toContainText('Local draft');
    await screenshot(page, 'admin-content-editor');
  });

  test('adds, edits, and removes a campus', async ({ page }) => {
    await page.getByRole('button', { name: 'Campuses & prayer' }).click();
    await page.getByRole('button', { name: '+ Add campus' }).click();
    await expect(page.locator('.campus-card')).toHaveCount(3);
    await page.locator('[data-path="campuses.2.name"]').fill('Edited campus');
    await page.locator('[data-kind="campus"]').last().click();
    await expect(page.locator('.campus-card')).toHaveCount(2);
  });

  test('persists a validated local draft after reload', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('textbox', { name: 'Name' }).fill('Local fictional edit');
    await page.getByRole('button', { name: 'Save local draft' }).click();
    await expect(page.locator('#editor-message')).toContainText('Saved locally');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Local fictional edit');
  });

  test('rejects invalid JSON and CSV without changing the editor', async ({ page }) => {
    await page.getByRole('button', { name: 'Import / export' }).click();
    await page.locator('#import-json').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
    await expect(page.locator('#editor-message')).toContainText('Import rejected');
    await page.locator('#import-csv').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('date,fajr\nnot-a-date,99:99') });
    await expect(page.locator('#editor-message')).toContainText('CSV rejected');
  });

  test('exports JSON and does not fake publish when API is unavailable', async ({ page }) => {
    await page.getByRole('button', { name: 'Import / export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    expect((await download).suggestedFilename()).toBe('openmasjid-site-backup.json');
    await page.route('**/api/session', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('#editor-message')).toContainText(/Publish unavailable|Sign in to publish/);
    await expect(page.locator('#editor-message')).not.toContainText('Committed');
  });

  test('supports basic keyboard tab access', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).not.toBe('BODY');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? document.activeElement?.getAttribute('type'))).toBeTruthy();
  });

  test('admin page has no horizontal overflow or uncaught exceptions', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    await assertNoHorizontalOverflow(page);
    expect(exceptions).toEqual([]);
    await screenshot(page, 'admin-home');
  });
});

test.describe('program and service pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
  });

  test('keeps card-only offerings unlinked and opens enabled details pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Programs', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();
    await expect(page.locator('#programs .service-card').filter({ hasText: 'Youth & family' }).getByRole('link')).toHaveCount(0);
    await page.locator('#programs .service-card').filter({ hasText: 'Learning for life' }).getByRole('link', { name: /More information/ }).click();
    await expect(page).toHaveURL(/\/programs\/learning-for-life\/$/);
    await expect(page.getByRole('heading', { name: 'Learning for life' })).toBeVisible();
    await expect(page.getByText('Our learning programs create welcoming spaces')).toBeVisible();
  });
});
