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
 * Multi-file drag-drop must open one window per file. Previously the drop
 * handler looped openOrReplaceLauncher per path, which honored the open-where
 * preference — so under "same window" each navigation clobbered the previous
 * and only the last file survived (while the overlay promised "Drop to open N
 * files"). A multi-file drop now forces a new window per document.
 *
 * Tauri's drag-drop event bus isn't present in the harness, so the launcher
 * exposes its drop handler (dev builds only) and we drive it directly, then
 * assert the real dispatch via the recorded invoke log.
 */
type InvokeEntry = { cmd: string; args: { kind?: string; filePath?: string } };

test('multi-file drop opens a window per file even under "same window" preference', async ({
  page,
}) => {
  await mockTauri(page, {
    settings: {
      theme: 'light',
      default_save_dir: null,
      open_window_preference: 'same',
      last_seen_version: '0.0.0',
    },
  });
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __deskApp_handleDrop?: unknown }).__deskApp_handleDrop ===
      'function',
  );

  await page.evaluate(() => {
    (
      window as unknown as { __deskApp_handleDrop: (paths: string[]) => void }
    ).__deskApp_handleDrop(['/docs/one.docx', '/sheets/two.xlsx']);
  });

  // Each file opened its own window — not a single same-window navigation that
  // would have dropped all but the last file.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __deskApp_invokeLog?: InvokeEntry[] }).__deskApp_invokeLog ?? [])
            .filter((e) => e.cmd === 'open_document_window')
            .map((e) => e.args.filePath),
      ),
    )
    .toEqual(['/docs/one.docx', '/sheets/two.xlsx']);

  // And kinds were routed by extension.
  const kinds = await page.evaluate(() =>
    ((window as unknown as { __deskApp_invokeLog?: InvokeEntry[] }).__deskApp_invokeLog ?? [])
      .filter((e) => e.cmd === 'open_document_window')
      .map((e) => e.args.kind),
  );
  expect(kinds).toEqual(['docx', 'sheets']);
});
