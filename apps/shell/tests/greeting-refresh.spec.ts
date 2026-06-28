// Copyright 2026 Casual Office
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
