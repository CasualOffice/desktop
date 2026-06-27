import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * The recent-files type filter is a role="tablist" of role="tab" buttons. It
 * should follow the WAI-ARIA tabs pattern: a roving tabindex (only the active
 * tab is Tab-reachable) and arrow-key navigation that moves + activates.
 */
test('filter tabs support arrow-key roving focus + roving tabindex', async ({ page }) => {
  await mockTauri(page, {
    recents: [
      { path: '/a/x.docx', kind: 'docx', last_opened: 1_700_000_000_000, pinned: false },
      { path: '/a/y.xlsx', kind: 'sheets', last_opened: 1_700_000_000_000, pinned: false },
    ],
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();

  const all = page.locator('.filter-btn[data-filter="all"]');
  const docs = page.locator('.filter-btn[data-filter="docx"]');
  await expect(all).toBeVisible();

  // Roving tabindex at rest: only the active (All) tab is Tab-reachable.
  await expect(all).toHaveAttribute('tabindex', '0');
  await expect(docs).toHaveAttribute('tabindex', '-1');

  // ArrowRight from the active tab moves focus to + activates the next tab.
  await all.focus();
  await page.keyboard.press('ArrowRight');

  expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.filter)).toBe(
    'docx',
  );
  await expect(docs).toHaveAttribute('aria-selected', 'true');
  await expect(docs).toHaveAttribute('tabindex', '0');
  await expect(all).toHaveAttribute('tabindex', '-1');

  // ArrowLeft wraps back to All.
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.filter)).toBe(
    'all',
  );
});
