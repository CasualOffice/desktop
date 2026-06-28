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
