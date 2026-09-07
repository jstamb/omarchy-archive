import { test, expect } from '@playwright/test';

// These tests exercise the actual built Pagefind index, not substituted results.
test('a preview exposes all matches beyond its eight visible links', async ({ page }) => {
  await page.goto('/');
  const search = page.locator('[data-search]').filter({ has: page.locator('#site-search') });
  await search.locator('input').fill('tailscale');
  await expect(search.locator('[data-search-note]')).toContainText(/matches/);
  const total = Number((await search.locator('[data-search-note]').innerText()).match(/\d+/)?.[0]);
  expect(total).toBeGreaterThan(8);
  const continuation = search.getByRole('link', { name: /view all/i });
  await expect(continuation).toBeVisible();
  await continuation.click();
  await expect(page).toHaveURL(/\/search\/\?q=tailscale/);
  const pageSize = Math.min(20, total);
  await expect(page.locator('main [data-search-results] > li')).toHaveCount(pageSize);
  if (total > 20) {
    await expect(page.getByRole('link', { name: /next/i })).toBeVisible();
  }
});

test('pagination and entity filters restore from shared URLs', async ({ page }) => {
  const response = await page.goto('/search/?q=omarchy&type=plugin&page=2');
  expect(response.status()).toBe(200);
  const hits = page.locator('main [data-search-results] > li');
  await expect(hits).toHaveCount(20);
  const secondPage = await hits.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  expect(secondPage.every(url => url.startsWith('/plugins/'))).toBe(true);
  const readHrefs = () => hits.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  await page.reload();
  await expect(hits).toHaveCount(20);
  expect(await readHrefs()).toEqual(secondPage);
  await page.getByRole('link', { name: /previous/i }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect.poll(readHrefs).not.toEqual(secondPage);
  await expect(hits).toHaveCount(20);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(readHrefs).toEqual(secondPage);
  await expect(hits).toHaveCount(20);
});

test('failed index loading offers retry and recovers without a reload', async ({ page }) => {
  await page.route('**/pagefind/pagefind.js', route => route.abort());
  const response = await page.goto('/search/?q=tailscale');
  expect(response.status()).toBe(200);
  const retry = page.getByRole('button', { name: /retry|try again/i });
  await expect(retry).toBeVisible();
  await page.unroute('**/pagefind/pagefind.js');
  await retry.click();
  await expect(page.locator('main [data-search-results] > li').first()).toBeVisible();
});

test('mobile detail pages keep global search visible outside the scrollable navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/themes/aetheria/');
  const search = page.locator('header').getByRole('link', { name: /search/i });
  await expect(search).toBeVisible();
  await expect(search).toBeInViewport();
  await search.click();
  await expect(page).toHaveURL(/\/search\//);
  await expect(page.locator('main').getByRole('searchbox')).toBeVisible();
});

test('mobile plugin filters leave the first result accessible without a wall of chips', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plugins/');
  const first = page.locator('main article').first();
  await expect(first).toBeVisible();
  const box = await first.boundingBox();
  expect(box.y).toBeLessThan(844);
  const toggle = page.getByRole('button', { name: /filters/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.locator('button[data-facet="ownership"][data-value="first-party"]').click();
  await expect(page).toHaveURL(/ownership=first-party/);
  await expect(page.locator('main article:visible')).toHaveCount(36);
});

test('filter changes do not detach and reinsert gallery cards', async ({ page }) => {
  await page.goto('/plugins/');
  await page.evaluate(() => {
    const parent = document.querySelector('main article').parentElement;
    window.__cardMutations = 0;
    new MutationObserver(records => {
      window.__cardMutations += records.filter(record => record.type === 'childList').length;
    }).observe(parent, { childList: true });
  });
  await page.locator('button[data-facet="ownership"][data-value="first-party"]').click();
  await expect(page.locator('main article:visible')).toHaveCount(36);
  expect(await page.evaluate(() => window.__cardMutations)).toBe(0);
});

test('the full plugin table filters all records and restores its query', async ({ page }) => {
  await page.goto('/plugins/all/');
  const input = page.locator('main').getByRole('searchbox');
  await expect(input).toBeVisible();
  await input.fill('tailscale');
  await expect(page).toHaveURL(/q=tailscale/);
  const rows = page.locator('main tbody tr:visible');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(100);
  await page.reload();
  await expect(input).toHaveValue('tailscale');
  await expect(rows).toHaveCount(count);
  await input.fill('no-such-plugin-archive-regression');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('main').getByRole('status')).toContainText(/0|no/i);
});

test('copy feedback matches what actually reached the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read'], { origin: 'http://127.0.0.1:4322' });
  const session = await context.newCDPSession(page);
  const origin = 'http://127.0.0.1:4322';
  await session.send('Browser.setPermission', {
    permission: { name: 'clipboard-write' },
    setting: 'denied',
    origin,
  });
  await page.goto('/themes/aetheria/');
  const button = page.locator('main [data-copy]').first();
  const command = await button.getAttribute('data-copy');
  await button.evaluate(node => node.click());
  await page.waitForFunction(() => {
    const button = document.querySelector('main [data-copy]');
    return button?.dataset.copied === 'true' || Boolean(document.querySelector('[data-copy-status]')?.textContent);
  });
  if ((await button.getAttribute('data-copied')) === 'true') {
    // The UI claims success with the Clipboard API denied, so the fallback
    // must have really copied: the clipboard holds the exact command.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
  } else {
    // Honest failure: manual-copy guidance and the command still selectable.
    await expect(page.locator('[data-copy-status]').filter({ hasText: /./ }).first()).toContainText(/copy/i);
    await expect(page.locator('main')).toContainText(command);
  }
});

test('the complete index discovers a plugin absent from the browsing subset', async ({ page }) => {
  await page.goto('/plugins/');
  const browsed = await page.locator('main article a[href^="/plugins/"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
  await page.goto('/plugins/all/');
  const candidate = await page.locator('main tbody tr a[href^="/plugins/"]').evaluateAll((links, browsed) => {
    const link = links.find(link => !browsed.includes(link.getAttribute('href')));
    return link ? { href: link.getAttribute('href'), name: link.textContent.trim() } : null;
  }, browsed);
  expect(candidate).not.toBeNull();
  await page.locator('main').getByRole('searchbox').fill(candidate.name);
  await expect(page.locator(`main tbody tr:visible a[href="${candidate.href}"]`)).toBeVisible();
});

test('creator pages link from a named theme author', async ({ page }) => {
  await page.goto('/themes/nord/');
  const author = page.locator('.facts a[href^="/creators/"]');
  await expect(author).toBeVisible();
  await author.click();
  await expect(page).toHaveURL(/\/creators\//);
  await expect(page.locator('main h1')).not.toHaveText('');
  await expect(page.locator('main article, main .grid .card').first()).toBeVisible();
});

test('theme compare restores ids from the URL', async ({ page }) => {
  const response = await page.goto('/themes/compare/?ids=nord,gruvbox');
  expect(response.status()).toBe(200);
  await expect(page.locator('[data-compare-grid] article')).toHaveCount(2);
  await expect(page).toHaveURL(/ids=nord,gruvbox/);
});

test('saved collections persist in this browser', async ({ page }) => {
  await page.goto('/themes/');
  const card = page.locator('article[data-card]').first();
  const href = await card.locator('.card__title a').getAttribute('href');
  await card.locator('[data-save]').click();
  await expect(card.locator('[data-save]')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('[data-save-dest]')).toBeVisible();
  await card.locator('[data-save-dest]').click();
  await expect(page).toHaveURL(/\/saved\//);
  await expect(page.locator(`[data-saved-list] a[href="${href}"]`)).toBeVisible();
});

test('the masthead shows when the index last ran, in Pacific Time', async ({ page }) => {
  await page.goto('/');
  const live = page.locator('.index-live');
  await expect(live).toBeVisible();
  await expect(live).toContainText(/last index:/i);
  await expect(live).toContainText(/Pacific Time/);
});

test('the homepage leads with recently indexed posts, not a static featured strip', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h2').first()).toContainText(/just indexed/i);
  await expect(page.locator('main h2', { hasText: 'Featured' })).toHaveCount(0);
});

test('start and install pages link the official ISO, not a fabricated /download path', async ({ page }) => {
  for (const path of ['/start/', '/install/']) {
    await page.goto(path);
    await expect(page.locator('a[href="https://omarchy.org/download"]')).toHaveCount(0);
    await expect(page.locator('a[href="https://omarchy.org/#install"]').first()).toBeVisible();
    const iso = page.locator('a[href^="https://iso.omarchy.org/"][href$=".iso"]');
    await expect(iso.first()).toBeVisible();
    await expect(page.locator('a[href$=".iso.sha256"]').first()).toBeVisible();
    await expect(page.locator('a[href$=".iso.sig"]').first()).toBeVisible();
  }
});

test('an out of range search page recovers to a reachable results page', async ({ page }) => {
  const response = await page.goto('/search/?q=tailscale&type=plugin&page=99999');
  expect(response.status()).toBe(200);
  await expect(page.locator('main [data-search-results] > li').first()).toBeVisible();
  await expect(page).not.toHaveURL(/page=99999/);
  expect(await page.locator('main [data-search-results] a').evaluateAll(links => links.every(link => link.getAttribute('href').startsWith('/plugins/')))).toBe(true);
});
