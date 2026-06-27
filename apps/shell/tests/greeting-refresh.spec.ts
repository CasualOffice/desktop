import { test, expect } from '@playwright/test';
import { mockTauri } from './_setup';

/**
 * The hero greeting is time-of-day aware. It must also re-render when the
 * launcher regains focus, so a window left open from morning to evening
 * doesn't keep saying "Good morning" until a reload (UX-AUDIT §2).
 */
test('hero greeting refreshes to the current time-of-day on focus', async ({ page }) => {
  // Freeze the clock in the morning before the app boots.
  await page.clock.install({ time: new Date('2026-06-27T09:00:00') });
  await mockTauri(page);
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#greeting')).toContainText('Good morning');

  // Jump to the evening and refocus — the greeting updates without a reload.
  await page.clock.setFixedTime(new Date('2026-06-27T20:00:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#greeting')).toContainText('Good evening');
});
