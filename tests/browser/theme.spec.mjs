import { test, expect } from '@playwright/test';

const bg = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());

test('the masthead picker searches indexed themes and restyles the site', async ({ page }) => {
  await page.goto('/');
  const picker = page.locator('[data-themepick]');
  await expect(picker.locator('[data-themepick-name]')).toHaveText('Tokyo Night');
  await expect(picker.locator('[data-themepick-pixels] i')).toHaveCount(5);
  expect(await bg(page)).toBe('#1a1b26');

  await picker.locator('[data-themepick-toggle]').click();
  const search = picker.locator('[data-themepick-search]');
  await expect(search).toBeFocused();
  await expect(picker.locator('[data-themepick-note]')).toContainText(/of \d+ themes/);
  await search.fill('gruv');
  const options = picker.locator('[role="option"]');
  await expect(options.first()).toContainText('Gruvbox');
  await expect(options.first().locator('.pixels i')).toHaveCount(5);
  await options.first().click();

  await expect(picker.locator('[data-themepick-pop]')).toBeHidden();
  await expect(picker.locator('[data-themepick-name]')).toHaveText('Gruvbox');
  expect(await bg(page)).not.toBe('#1a1b26');
  await expect(page.locator('html')).toHaveAttribute('data-site-theme', 'gruvbox');
  const chosen = await bg(page);

  // Persists, and is painted before the picker script runs.
  await page.goto('/themes/');
  expect(await bg(page)).toBe(chosen);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', chosen);
  await expect(picker.locator('[data-themepick-name]')).toHaveText('Gruvbox');

  await picker.locator('[data-themepick-toggle]').click();
  await picker.locator('[data-themepick-reset]').click();
  expect(await bg(page)).toBe('#1a1b26');
  await expect(picker.locator('[data-themepick-name]')).toHaveText('Tokyo Night');
});

test('keyboard: arrows and enter pick a theme, escape closes', async ({ page }) => {
  await page.goto('/');
  const picker = page.locator('[data-themepick]');
  await picker.locator('[data-themepick-toggle]').click();
  const search = picker.locator('[data-themepick-search]');
  await search.fill('nord');
  await expect(picker.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  await search.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-site-theme', 'nord');
  await picker.locator('[data-themepick-toggle]').click();
  await search.press('Escape');
  await expect(picker.locator('[data-themepick-pop]')).toBeHidden();
  await expect(picker.locator('[data-themepick-toggle]')).toBeFocused();
});

test('a theme page shows its pixels and can apply itself to the site', async ({ page }) => {
  await page.goto('/themes/catppuccin/');
  await expect(page.locator('.pagehead .pixels--lg i').first()).toBeVisible();
  const apply = page.locator('[data-theme-apply="catppuccin"]');
  await expect(apply).toHaveText(/use on this site/i);
  await apply.click();
  await expect(apply).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-site-theme', 'catppuccin');
  await expect(page.locator('[data-themepick-name]')).toHaveText('Catppuccin');
  await apply.click();
  await expect(apply).toHaveAttribute('aria-pressed', 'false');
  expect(await bg(page)).toBe('#1a1b26');
});

test('theme cards carry their palette as pixels', async ({ page }) => {
  await page.goto('/themes/');
  const card = page.locator('article[data-card][data-type="theme"]').first();
  await expect(card.locator('.card__pixels i').first()).toBeVisible();
  expect(await card.locator('.card__pixels i').count()).toBeGreaterThan(3);
});

test('a light theme flips the colour scheme', async ({ page }) => {
  await page.goto('/');
  const picker = page.locator('[data-themepick]');
  await picker.locator('[data-themepick-toggle]').click();
  await picker.locator('[data-themepick-search]').fill('latte');
  await picker.locator('[role="option"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-tone', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
});
