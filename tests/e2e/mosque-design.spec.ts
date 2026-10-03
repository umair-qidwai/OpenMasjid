import { test, expect } from '@playwright/test';

test('mosque service cards are centered, readable and responsive', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const cards = page.locator('.service-card');
  await expect(cards).toHaveCount(3);
  await cards.first().scrollIntoViewIfNeeded();
  const layout = await cards.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const heading = node.querySelector('h3')!;
    return { x: box.x, y: box.y, width: box.width, align: style.textAlign, radius: parseFloat(style.borderRadius), font: getComputedStyle(heading).fontFamily };
  }));
  for (const card of layout) {
    expect(card.align).toBe('center');
    expect(card.radius).toBeGreaterThanOrEqual(20);
    expect(card.font).toContain('Lora');
  }
  if (page.viewportSize()!.width > 900) {
    expect(Math.abs(layout[0].y - layout[2].y)).toBeLessThan(2);
    expect(layout[1].x).toBeGreaterThan(layout[0].x);
  } else {
    expect(layout[1].y).toBeGreaterThan(layout[0].y);
  }
  await expect(cards.locator('a')).toHaveCount(3);
  for (const link of await cards.locator('a').all()) {
    await expect(link).toHaveAttribute('href', /#(prayer|visit)/);
  }
  expect(await page.locator('.type-line').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(28);
  expect(await page.locator('main .eyebrow').count()).toBe(0);
  for (const heading of await page.locator('main h2').all()) {
    expect(await heading.evaluate(el => getComputedStyle(el).textAlign)).toBe('center');
  }
  expect(await page.locator('.site-header').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  await expect(cards.first()).not.toHaveClass(/is-pending|is-visible/);
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
    const event = page.locator('.event-card').first();
    await event.scrollIntoViewIfNeeded();
    await expect(event).not.toHaveClass(/is-pending|is-visible/);
    await event.hover();
    await expect.poll(() => event.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)).toBeLessThan(-5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion keeps content visible without typing or entrance animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.type-line')).not.toHaveClass(/typing/);
  const card = page.locator('.service-card').first();
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  expect(await card.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
