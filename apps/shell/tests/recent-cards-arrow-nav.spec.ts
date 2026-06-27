import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * Recent file cards: arrow keys move focus between cards (UX-AUDIT §2). This
 * is additive over Tab — it just gives a fast card-to-card hop without having
 * to Tab through each card's ⋯ button.
 */
test('recent cards support arrow-key navigation', async ({ page }) => {
  await mockTauri(page, {
    recents: [
      { path: '/a/one.docx', kind: 'docx', last_opened: 1_700_000_000_000, pinned: false },
      { path: '/a/two.xlsx', kind: 'sheets', last_opened: 1_700_000_000_000, pinned: false },
      { path: '/a/three.docx', kind: 'docx', last_opened: 1_700_000_000_000, pinned: false },
    ],
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();

  const cards = page.locator('.recent-card');
  await expect(cards).toHaveCount(3);

  // Focus the first card, then walk the list with the arrow keys.
  await cards.nth(0).focus();
  const focusedTitle = () =>
    page.evaluate(() => (document.activeElement as HTMLElement)?.title ?? null);

  await page.keyboard.press('ArrowDown');
  expect(await focusedTitle()).toBe('/a/two.xlsx');

  await page.keyboard.press('ArrowDown');
  expect(await focusedTitle()).toBe('/a/three.docx');

  // Wraps around to the first card.
  await page.keyboard.press('ArrowDown');
  expect(await focusedTitle()).toBe('/a/one.docx');

  // ArrowUp goes backwards (wraps to last).
  await page.keyboard.press('ArrowUp');
  expect(await focusedTitle()).toBe('/a/three.docx');

  // Home / End jump to the ends.
  await page.keyboard.press('Home');
  expect(await focusedTitle()).toBe('/a/one.docx');
  await page.keyboard.press('End');
  expect(await focusedTitle()).toBe('/a/three.docx');
});
