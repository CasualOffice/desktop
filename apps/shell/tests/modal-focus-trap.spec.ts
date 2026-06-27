import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * Launcher modals must trap focus: Tab / Shift+Tab cycle within the dialog
 * instead of escaping to the home screen behind the backdrop. Previously they
 * handled Escape/Enter but not Tab.
 */
test('open-choice modal traps Tab focus within the dialog', async ({ page }) => {
  await mockTauri(page, {
    settings: {
      theme: 'light',
      default_save_dir: null,
      open_window_preference: 'ask',
      last_seen_version: '0.0.0',
    },
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();

  // New document with the "ask" preference pops the open-where modal.
  await page.locator('#new-docx').click();
  await expect(page.locator('#open-choice')).toBeVisible();

  const inModal = () => page.evaluate(() => !!document.activeElement?.closest('#open-choice'));

  // Tab more times than there are focusables — it must wrap and never escape.
  await page.locator('#open-choice-same').focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await inModal()).toBe(true);
  }
  // Shift+Tab likewise stays inside.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inModal()).toBe(true);
  }
});
