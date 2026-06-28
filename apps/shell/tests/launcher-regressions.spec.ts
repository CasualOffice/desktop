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

/**
 * Launcher regression tests — recents-open, clear-recents confirmation,
 * and open-where modal dismissal. These guard JS-observable contracts on
 * top of the shared `mockTauri` harness (see _setup.ts): we wrap the
 * mock's `invoke` to record every call, then assert the launcher calls
 * the right Tauri command (or, for dismissal/cancel, that it calls
 * NOTHING that would open a window).
 *
 * NOTE on paired fixes: two behaviours below depend on a concurrent UI
 * change landing in src/main.ts —
 *   - "Clear all" must route through the in-app confirm modal
 *     (confirmDialog) instead of clearing recents immediately.
 *   - The open-where modal must dismiss on a backdrop click (not only
 *     Escape).
 * Those tests encode the INTENDED contract. They are expected to fail
 * until the paired src/main.ts change lands; see the final report. They
 * are intentionally not weakened to pass against today's code.
 */
import { expect, test, type Page } from '@playwright/test';
import { mockTauri, type MockState } from './_setup';

/**
 * After `mockTauri`, wrap `window.__TAURI__.core.invoke` so every call is
 * pushed to `window.__invokeLog`. Must run as a SEPARATE addInitScript
 * AFTER mockTauri's, so it sees the installed mock. Playwright runs init
 * scripts in registration order, so call this after mockTauri.
 */
async function recordInvokes(page: Page) {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__invokeLog = [] as Array<{ cmd: string; args: Record<string, unknown> }>;
    const core = w.__TAURI__?.core;
    if (!core?.invoke) return;
    const orig = core.invoke.bind(core);
    core.invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
      w.__invokeLog.push({ cmd, args });
      return orig(cmd, args);
    };
    if (w.__TAURI_INTERNALS__) w.__TAURI_INTERNALS__.invoke = core.invoke;
  });
}

function invokeLog(page: Page) {
  return page.evaluate(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__invokeLog as Array<{ cmd: string; args: Record<string, unknown> }>,
  );
}

const NOW = Math.floor(Date.now() / 1000);
const RECENTS: MockState['recents'] = [
  { path: '/home/u/report.docx', kind: 'docx', last_opened: NOW - 60, pinned: false },
  { path: '/home/u/numbers.xlsx', kind: 'sheets', last_opened: NOW - 120, pinned: false },
];

test.describe('Recents — opening a file', () => {
  /**
   * 5a. Opening a recent file must call open_document_window with the
   *     file's kind + path. The "Open in new window" context-menu action
   *     is the direct, deterministic path to that command (the left-click
   *     path goes through the open-where modal / preference branch). We
   *     assert kind + filePath flow through untouched — a regression that
   *     swapped kind for path, or dropped the path, would open the wrong
   *     editor or a blank window.
   */
  test('opening a recent in a new window invokes open_document_window with kind+path', async ({
    page,
  }) => {
    await mockTauri(page, { recents: RECENTS });
    await recordInvokes(page);
    await page.goto('/');

    const card = page.locator('.recent-card').filter({ hasText: 'numbers.xlsx' });
    await card.click({ button: 'right' });
    await expect(page.locator('.context-menu')).toBeVisible();
    await page.locator('.context-menu-item', { hasText: 'Open in new window' }).click();

    const log = await invokeLog(page);
    const openCall = log.find((e) => e.cmd === 'open_document_window');
    expect(openCall, 'open_document_window must be invoked').toBeTruthy();
    expect(openCall?.args.kind, 'kind must match the recent file').toBe('sheets');
    expect(openCall?.args.filePath, 'filePath must be the recent file path').toBe('/home/u/numbers.xlsx');
  });
});

test.describe('Recents — clear all confirmation (paired fix)', () => {
  /**
   * 5b. "Clear all" is destructive — it must require an explicit confirm
   *     before wiping recents. Contract:
   *       1. Clicking "Clear all" shows the confirm modal; recents are
   *          NOT yet cleared (no clear_recent_files invoked).
   *       2. clear_recent_files is invoked ONLY after the user confirms.
   *
   *     PAIRED FIX: today src/main.ts clears immediately with no modal.
   *     This test is expected to FAIL until "Clear all" is routed through
   *     confirmDialog(). The confirm modal markup (confirmDialog) already
   *     exists in main.ts: `.modal-backdrop > .modal` with a
   *     `[data-act=confirm]` button.
   */
  test('Clear all asks for confirmation and only clears on confirm', async ({ page }) => {
    await mockTauri(page, { recents: RECENTS });
    await recordInvokes(page);
    await page.goto('/');
    await expect(page.locator('.recent-card')).toHaveCount(2);

    await page.locator('#clear-recents').click();

    // A confirm dialog must appear, and nothing must be cleared yet. The
    // confirm modal is the .modal-backdrop that carries a [data-act=confirm]
    // button (confirmDialog markup) — scoped this way so we don't collide
    // with the static #open-choice / #whats-new backdrops in the DOM.
    const confirmBackdrop = page.locator('.modal-backdrop:has([data-act=confirm])');
    const confirmBtn = confirmBackdrop.locator('[data-act=confirm]');
    await expect(confirmBtn, 'a confirm dialog must appear before clearing').toBeVisible();

    let log = await invokeLog(page);
    expect(
      log.find((e) => e.cmd === 'clear_recent_files'),
      'recents must NOT be cleared before the user confirms',
    ).toBeUndefined();

    // Confirm → now it clears.
    await confirmBtn.click();
    await expect(confirmBackdrop, 'the confirm dialog should close after confirming').toHaveCount(0);

    log = await invokeLog(page);
    expect(
      log.find((e) => e.cmd === 'clear_recent_files'),
      'clear_recent_files must be invoked after confirming',
    ).toBeTruthy();
  });

  /**
   * 5c. Cancelling the confirm dialog must leave recents intact (no
   *     clear command fired). Same paired fix as 5b.
   */
  test('Clear all cancelled leaves recents intact', async ({ page }) => {
    await mockTauri(page, { recents: RECENTS });
    await recordInvokes(page);
    await page.goto('/');

    await page.locator('#clear-recents').click();
    const cancelBtn = page.locator('.modal-backdrop [data-act=cancel]');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const log = await invokeLog(page);
    expect(
      log.find((e) => e.cmd === 'clear_recent_files'),
      'cancelling must NOT clear recents',
    ).toBeUndefined();
  });
});

test.describe('Open-where modal — dismissal does not open a window', () => {
  /**
   * 6a. Escape dismisses the open-where modal WITHOUT opening anything.
   *     (Escape dismissal already works today; this adds the assertion
   *     that no window/navigation command fired on dismiss.)
   */
  test('Escape closes the modal and opens no window', async ({ page }) => {
    await mockTauri(page);
    await recordInvokes(page);
    await page.goto('/');

    await page.locator('#new-docx').click();
    await expect(page.locator('#open-choice')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#open-choice')).toBeHidden();

    const log = await invokeLog(page);
    expect(
      log.find((e) => e.cmd === 'open_document_window'),
      'dismissing via Escape must not open a window',
    ).toBeUndefined();
  });

  /**
   * 6b. Clicking the backdrop (outside the modal card) dismisses the
   *     modal WITHOUT opening anything.
   *
   *     PAIRED FIX: today askOpenChoice() wires Escape + the explicit
   *     Cancel button, but NOT a backdrop (mousedown-on-#open-choice)
   *     handler — matching the confirmDialog() pattern that already does
   *     `backdrop.addEventListener('mousedown', e => e.target === backdrop
   *     && finish(false))`. This test is expected to FAIL until the
   *     same backdrop-cancel is added to askOpenChoice().
   */
  test('backdrop click closes the modal and opens no window', async ({ page }) => {
    await mockTauri(page);
    await recordInvokes(page);
    await page.goto('/');

    await page.locator('#new-docx').click();
    const modal = page.locator('#open-choice');
    await expect(modal).toBeVisible();

    // Click the backdrop at a top-left corner, well outside the centered
    // modal card, so the target is #open-choice itself.
    const box = await modal.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + 8, box!.y + 8);

    await expect(modal).toBeHidden();
    const log = await invokeLog(page);
    expect(
      log.find((e) => e.cmd === 'open_document_window'),
      'dismissing via backdrop must not open a window',
    ).toBeUndefined();
  });
});
