import { test, expect, type Page } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * maybeCheckForUpdate() gates the on-launch update check so users who can't or
 * don't want updates aren't prompted. The plugin-updater wrapper's check()
 * dispatches `plugin:updater|check`, so its presence in the invoke log tells us
 * whether the check actually ran past the gates.
 */

const updateCheckRan = (page: Page) =>
  page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).__deskApp_invokeLog ?? []).some(
      (e: { cmd: string }) => e.cmd === 'plugin:updater|check',
    ),
  );

const baseSettings = {
  theme: 'light' as const,
  default_save_dir: null,
  last_seen_version: '0.0.0',
};

test('checks for an update on a supported install with the setting on', async ({ page }) => {
  await mockTauri(page, { settings: baseSettings, update_supported: true });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  // The check is fire-and-forget after boot — poll until it dispatches.
  await expect.poll(() => updateCheckRan(page)).toBe(true);
});

test('skips the update check when auto-update is off', async ({ page }) => {
  await mockTauri(page, {
    settings: { ...baseSettings, auto_update: false },
    update_supported: true,
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  // Give the fire-and-forget path time to run, then assert it never checked.
  await page.waitForTimeout(300);
  expect(await updateCheckRan(page)).toBe(false);
});

test('skips the update check when the install format is not updatable', async ({ page }) => {
  // e.g. a Linux .deb — is_update_supported returns false.
  await mockTauri(page, { settings: baseSettings, update_supported: false });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await updateCheckRan(page)).toBe(false);
});
