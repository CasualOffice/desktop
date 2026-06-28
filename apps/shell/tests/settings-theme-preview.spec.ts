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
 * The Settings theme radios should preview live (like the first-run wizard),
 * and a close without saving must revert the preview to the stored theme.
 * Previously the theme only applied on Save, so the control behaved
 * inconsistently with the wizard.
 */
test('Settings theme previews live and reverts when closed without saving', async ({ page }) => {
  await mockTauri(page, {
    settings: { theme: 'light', default_save_dir: null, last_seen_version: '0.0.0' },
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Open Settings.
  await page.locator('#user-chip').click();
  await expect(page.locator('#settings-panel')).toBeVisible();

  // Selecting dark previews immediately — before any Save.
  await page.locator('input[name=settings-theme][value="dark"]').check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Closing without saving reverts to the stored theme.
  await page.locator('#settings-close').click();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
