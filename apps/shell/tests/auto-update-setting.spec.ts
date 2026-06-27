import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * The "Automatically check for updates" toggle (default on) round-trips
 * through save_settings, so the on-launch update check can be disabled.
 */
test('auto-update toggle persists through save_settings', async ({ page }) => {
  await mockTauri(page);
  await page.goto('/');
  await page.locator('#user-chip').click();

  // Default on.
  const toggle = page.locator('#settings-auto-update');
  await expect(toggle).toBeChecked();

  // Turn it off and save.
  await toggle.uncheck();
  await page.locator('#settings-save').click();
  await expect(page.locator('.toast.success')).toContainText('Settings saved');

  // The persisted settings object carries auto_update: false.
  const saved = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = (window as any).__deskApp_invokeLog as Array<{ cmd: string; args: any }>;
    const last = [...log].reverse().find((e) => e.cmd === 'save_settings');
    return last?.args?.settings?.auto_update;
  });
  expect(saved).toBe(false);
});
