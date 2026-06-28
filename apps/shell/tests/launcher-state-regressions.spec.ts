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

type InvokeEntry = { cmd: string; args: { settings?: Record<string, unknown>; dirty?: boolean } };
const invokeLog = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __deskApp_invokeLog?: InvokeEntry[] }).__deskApp_invokeLog ?? [],
  );

/**
 * Re-running the setup wizard built a Settings object with only theme +
 * default_save_dir; save_settings writes verbatim, so serde defaults wiped the
 * other persisted prefs. The wizard now spreads the current settings first.
 */
test('finishing the wizard preserves non-wizard settings', async ({ page }) => {
  await mockTauri(page, {
    is_first_run: true,
    profile: null,
    settings: {
      theme: 'light',
      default_save_dir: null,
      privacy_mode: true,
      open_window_preference: 'new',
    },
  });
  await page.goto('/');
  await expect(page.locator('#wizard')).toBeVisible();

  await page.locator('#wiz-name').fill('Sachin');
  await page.locator('#wiz-next-1').click();
  await page.locator('#wiz-next-2').click();
  await page.locator('#wiz-finish').click();

  const saved = (await invokeLog(page))
    .reverse()
    .find((e) => e.cmd === 'save_settings')?.args.settings;
  expect(saved?.privacy_mode).toBe(true);
  expect(saved?.open_window_preference).toBe('new');
});

/**
 * The close guard is now attached to the launcher "main" window. Same-window
 * editing marks it dirty; navigating back home reloads this bundle but the
 * native dirty flag would persist, popping a false "unsaved changes" prompt
 * over the home screen. Boot now clears it.
 */
test('launcher clears its own unsaved-changes flag on boot', async ({ page }) => {
  await mockTauri(page);
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();

  const cleared = (await invokeLog(page)).some(
    (e) => e.cmd === 'set_window_dirty' && e.args.dirty === false,
  );
  expect(cleared).toBe(true);
});
