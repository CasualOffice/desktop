import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * "What's new" must only show a changelog block that matches the running
 * version. Previously it fell back to CHANGELOG[0], so a version without its
 * own block (e.g. 0.0.1) surfaced the 0.0.0 "Welcome" content mislabeled as the
 * new version.
 */
test('What’s-new does not show a mislabeled entry for a version with no block', async ({
  page,
}) => {
  await mockTauri(page, {
    app_version: '0.0.1', // no CHANGELOG entry for 0.0.1
    settings: { theme: 'light', default_save_dir: null, last_seen_version: '0.0.0' },
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  // Let the async version check run, then assert the modal never appears.
  await page.waitForTimeout(150);
  await expect(page.locator('#whats-new')).toBeHidden();
});

test('What’s-new shows the matching entry when one exists', async ({ page }) => {
  await mockTauri(page, {
    app_version: '0.0.0', // CHANGELOG has a 0.0.0 entry
    settings: { theme: 'light', default_save_dir: null, last_seen_version: '0.0.0-pre' },
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#whats-new')).toBeVisible();
  await expect(page.locator('#whats-new-version')).toHaveText('Casual Office 0.0.0');
});
