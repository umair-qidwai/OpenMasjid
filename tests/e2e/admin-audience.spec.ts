import { test, expect } from '@playwright/test';

test('donation page shares local fonts and centered rounded panels', async ({ page }) => {
  await page.goto('/donate/');
  await expect(page.locator('link[href$="assets/fonts/fonts.css"]')).toHaveCount(1);
  await expect(page.locator('.giving-hero h1')).toHaveCSS('font-family', /Lora/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Source Sans 3/);
  await expect(page.locator('.giving-hero')).toHaveCSS('text-align', 'center');
  await expect(page.locator('.donation-panel')).toHaveCSS('border-radius', '28px');
  await expect(page.locator('.eyebrow')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('dynamic giving content retains theme and sandbox', async ({ page }, testInfo) => {
  const content = await (await page.request.get('/data/v1/site.json')).json();
  let donation = { mode: 'external', externalUrl: 'https://give.example.org/campaign', customHtml: '' };
  await page.route('**/data/v1/site.json', route => route.fulfill({ json: { ...content, donation } }));
  await page.goto('/donate/');
  await expect(page.locator('.external-give h3')).toHaveCSS('font-family', /Lora/);
  await expect(page.locator('.external-give h3')).toHaveCSS('font-size', '32px');
  await expect(page.locator('.external-give a')).toHaveAttribute('href', donation.externalUrl);
  await page.screenshot({ path: testInfo.outputPath('donation-theme.png'), fullPage: false });
  donation = { mode: 'custom', externalUrl: '', customHtml: '<h2>Community giving form</h2><script>parent.document.body.dataset.compromised="yes"</script>' };
  await page.reload();
  const frame = page.getByTitle('Donation form');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(frame).toHaveCSS('border-radius', '14px');
  expect(await frame.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(540);
  await expect(frame.contentFrame().getByRole('heading', { name: 'Community giving form' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-compromised', 'yes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const collection of ['events', 'announcements']) {
  test(`${collection} named campus audiences serialize one, multiple, and explicit all`, async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Events & news' }).click();
    const audience = page.locator(`[data-audience="${collection}.0"]`);
    await expect(audience.getByLabel('All campuses', { exact: true })).toBeVisible();
    await audience.getByLabel('Specific campuses', { exact: true }).check();
    const campuses = audience.locator('input[type="checkbox"]');
    const content = await (await page.request.get('/data/v1/site.json')).json();
    for (const campus of content.campuses) await expect(audience.getByLabel(campus.name, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await campuses.nth(0).check();
    await campuses.nth(1).uncheck();
    const save = async (ids: string[]) => {
      await page.getByRole('button', { name: 'Save local draft' }).click();
      await expect(page.locator('#editor-message')).toContainText('Saved locally');
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem('openmasjid-draft')!)[key][0].campusIds, collection)).toEqual(ids);
    };
    await save(['demo-central']);
    await campuses.nth(1).check();
    await save(['demo-central', 'demo-riverside']);
    await audience.getByLabel('All campuses', { exact: true }).check();
    await save([]);
    await audience.getByLabel('Specific campuses', { exact: true }).check();
    await campuses.nth(0).uncheck();
    await campuses.nth(1).uncheck();
    await page.getByRole('button', { name: '+ Event', exact: true }).click();
    await expect(audience.getByLabel('Specific campuses', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Save local draft' }).click();
    await expect(page.locator('#editor-message')).toContainText('Select at least one campus');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.locator('#editor-message')).toContainText('Select at least one campus');
    await page.getByRole('button', { name: 'Import / export' }).click();
    await page.getByRole('button', { name: 'Export JSON' }).click();
    await expect(page.locator('#editor-message')).toContainText('Select at least one campus');
  });
}
