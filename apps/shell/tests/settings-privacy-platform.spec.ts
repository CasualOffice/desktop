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
 * The "hide window from screenshots" privacy toggle is a no-op on Linux/
 * WebKitGTK (no compositor content-protection API). The control is disabled
 * there so its enabled state reflects whether it actually does anything, and
 * stays interactive on platforms where it works.
 */
const LINUX_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16 Safari/605.1.15';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16 Safari/605.1.15';

async function openSettings(page: import('@playwright/test').Page) {
  await mockTauri(page);
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#user-chip').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
}

test.describe('Linux', () => {
  test.use({ userAgent: LINUX_UA });
  test('privacy toggle is disabled (content protection is a no-op)', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#settings-privacy')).toBeDisabled();
  });
});

test.describe('macOS', () => {
  test.use({ userAgent: MAC_UA });
  test('privacy toggle stays interactive', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#settings-privacy')).toBeEnabled();
  });
});
