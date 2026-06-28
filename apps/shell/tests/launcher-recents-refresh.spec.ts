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
 * Recents are maintained out-of-process: a document window that saves or opens
 * a file calls add_recent_file in the Rust core, not in the launcher. So when
 * the launcher regains focus it must re-pull the list, otherwise a file the
 * user just saved elsewhere wouldn't appear until a manual action (UX-AUDIT §5).
 */
test('recents list refreshes when the launcher regains focus', async ({ page }) => {
  await mockTauri(page, {
    recents: [{ path: '/a/old.docx', kind: 'docx', last_opened: 1_700_000_000_000, pinned: false }],
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.recent-card')).toHaveCount(1);

  // Simulate a doc window saving a new file: mutate the backing recents the
  // mock returns from get_recent_files, then refocus the launcher window.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__deskApp_mock_state;
    s.recents.unshift({
      path: '/a/new.xlsx',
      kind: 'sheets',
      last_opened: 1_700_000_100_000,
      pinned: false,
    });
    window.dispatchEvent(new Event('focus'));
  });

  await expect(page.locator('.recent-card')).toHaveCount(2);
  await expect(page.locator('.recent-card[title="/a/new.xlsx"]')).toBeVisible();
});
