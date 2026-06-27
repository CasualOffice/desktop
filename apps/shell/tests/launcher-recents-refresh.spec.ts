import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * Recents are maintained out-of-process: a document window that saves or opens
 * a file calls add_recent_file in the Rust core, not in the launcher. So when
 * the launcher regains focus it must re-pull the list, otherwise a file the
 * user just saved elsewhere wouldn't appear until a manual action (UX-AUDIT §5).
 */
test('recents list refreshes when the launcher regains focus', async ({ page }) => {
  await mockTauri(page, {
    recents: [{ path: '/a/old.docx', kind: 'docx', last_opened: 1_700_000_000_000, pinned: false }],
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.recent-card')).toHaveCount(1);

  // Simulate a doc window saving a new file: mutate the backing recents the
  // mock returns from get_recent_files, then refocus the launcher window.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__deskApp_mock_state;
    s.recents.unshift({
      path: '/a/new.xlsx',
      kind: 'sheets',
      last_opened: 1_700_000_100_000,
      pinned: false,
    });
    window.dispatchEvent(new Event('focus'));
  });

  await expect(page.locator('.recent-card')).toHaveCount(2);
  await expect(page.locator('.recent-card[title="/a/new.xlsx"]')).toBeVisible();
});
