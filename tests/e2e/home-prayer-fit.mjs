// Run against a built preview: node tests/e2e/home-prayer-fit.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const out = process.env.PRAYER_FIT_OUTPUT || 'test-results-local/prayer-fit';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 360, height: 800 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('openmasjid-campus', 'demo-central'));
    console.log('Opening viewport', viewport);
    await page.goto(process.env.PRAYER_FIT_URL || 'http://localhost:4322/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))]));
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      const section = document.querySelector('#prayer');
      const header = document.querySelector('.site-header').getBoundingClientRect();
      window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - header.bottom - 8);
    });
    await page.waitForTimeout(200);
    const metrics = await page.evaluate(() => {
      const rect = element => {
        const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
        return { x, y, width, height, bottom, right };
      };
      const cards = [...document.querySelectorAll('[data-prayer-card]')];
      const paint = el => {
        const s = getComputedStyle(el);
        return [s.backgroundColor, s.borderColor, s.boxShadow];
      };
      return {
        section: rect(document.querySelector('#prayer')),
        panel: rect(document.querySelector('#prayer-panel')),
        jumuah: rect(document.querySelector('#jumuah')),
        cards: cards.map(el => ({ key: el.dataset.prayerCard, state: el.dataset.prayerState, ...rect(el), paint: paint(el), overflow: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
          childrenFit: [...el.children].every(child => { const a = rect(child), b = rect(el); return a.x >= b.x && a.right <= b.right && a.y >= b.y && a.bottom <= b.bottom; }),
          timeSize: parseFloat(getComputedStyle(el.querySelector('b')).fontSize) })),
        timers: document.querySelectorAll('#prayer [role="timer"]').length,
        sunriseIqamah: document.querySelectorAll('[data-prayer-card="sunrise"] [data-iqamah]').length,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        headerBottom: document.querySelector('.site-header').getBoundingClientRect().bottom
      };
    });
    const name = `${viewport.width}x${viewport.height}`;
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    console.log(name, JSON.stringify(metrics));
    assert.deepEqual(metrics.cards.map(c => c.key), ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
    assert.equal(metrics.timers, 1);
    assert.equal(metrics.sunriseIqamah, 0);
    assert.equal(metrics.pageOverflow, false);
    assert.ok(metrics.section.y >= metrics.headerBottom, 'section clears floating header');
    assert.ok(metrics.section.bottom <= viewport.height + 1, 'entire section fits below floating header');
    assert.ok(metrics.jumuah.bottom <= viewport.height, 'Jumuah is visible without another scroll');
    for (const card of metrics.cards) {
      assert.ok(card.bottom <= viewport.height && card.x >= 0 && card.right <= viewport.width);
      assert.ok(!card.overflow && card.childrenFit, `${card.key} contents fit`);
      assert.ok(card.timeSize >= 24, 'legible prayer times');
    }
    assert.equal(new Set(metrics.cards.map(c => Math.round(c.y))).size, viewport.width > 1000 ? 1 : 3);
    const next = metrics.cards.filter(c => c.state === 'next');
    assert.equal(next.length, 1);
    const normal = metrics.cards.filter(c => c.state !== 'next');
    for (const card of normal) assert.deepEqual(card.paint, normal[0].paint, 'only next is highlighted');
    assert.notDeepEqual(next[0].paint, normal[0].paint);
    await page.close();
  }
  console.log('Prayer viewport fit passed.');
} finally {
  await browser.close();
}
