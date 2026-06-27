import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * On relaunch the launcher must detect orphaned crash-recovery sidecars
 * (pending_recoveries) and offer to recover; nothing pending → no prompt.
 */
test('offers crash recovery on relaunch when a sidecar is pending', async ({ page }) => {
  await mockTauri(page, {
    recoveries: [
      { path: '/docs/report.docx', recovery_path: '/docs/.report.docx.recovery', saved_at: 1_700_000_000 },
    ],
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.getByText('Recover unsaved changes?')).toBeVisible();
  await expect(page.getByText('report.docx')).toBeVisible();
});

test('no recovery prompt when nothing is pending', async ({ page }) => {
  await mockTauri(page);
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByText('Recover unsaved changes?')).toHaveCount(0);
});
