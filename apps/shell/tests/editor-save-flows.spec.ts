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
 * Regression tests for the editor save bridge — the data-loss-critical
 * paths that the simpler `editor-save.spec.ts` doesn't cover.
 *
 * These exercise `window.__deskApp__` directly (the bridge contract),
 * driving Save / Save As through the JS-observable surface and asserting
 * the right Tauri commands fire, in the right order, with the right args.
 * We deliberately don't click the editor's own Save button here — the
 * editor→bridge wiring is covered in editor-save.spec.ts; this file
 * isolates the bridge's own behaviour so a failure points squarely at
 * the bootstrap's save semantics.
 *
 * Atomic write contract (from each editor's desk-bridge-bootstrap.ts):
 *   save(bound path)  → begin_save_document → write_save_chunk(s)
 *                       → commit_save_document, returns the path.
 *   saveAs(picked)    → pick_save_path → (if null) return null, no commit
 *                       → else chunkedWrite + add_recent_file, rebinds
 *                         filePath to the new path.
 *   any chunk/commit reject → save()/saveAs() rejects (never swallowed).
 *
 * Run under both editors (docx + sheets) since the two bootstraps are
 * meant to stay byte-for-byte equivalent in their save logic.
 */
import { expect, test, type Page } from '@playwright/test';

interface InvokeEntry {
  cmd: string;
  args: Record<string, unknown>;
}

type RejectPlan = { rejectOn?: string; rejectWith?: string; pickReturns?: string | null };

/**
 * Install a recording Tauri shim. `__invokeLog` captures every call in
 * order. `__mockPlan` (mutable from the page) controls dynamic behaviour:
 *   - pickReturns: what `pick_save_path` resolves to (default a NEW path).
 *   - rejectOn: a command name that should reject (simulates a write/
 *     commit failure on disk).
 */
async function installRecorder(page: Page, initialPick: string | null = '/mock/path/PICKED-saveas') {
  await page.addInitScript((pick) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__invokeLog = [] as InvokeEntry[];
    w.__mockPlan = { pickReturns: pick, rejectOn: undefined, rejectWith: 'disk full (ENOSPC)' };
    const PK = [0x50, 0x4b, 0x03, 0x04];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoke = async (cmd: string, args: any = {}) => {
      w.__invokeLog.push({ cmd, args });
      const plan = w.__mockPlan;
      if (plan.rejectOn && cmd === plan.rejectOn) {
        throw new Error(plan.rejectWith);
      }
      switch (cmd) {
        case 'document_size':
          return PK.length;
        case 'read_document_chunk':
          return PK.slice(args.offset ?? 0, (args.offset ?? 0) + (args.length ?? PK.length));
        case 'load_document':
          return PK.slice();
        case 'get_profile':
          return {
            name: 'Test User',
            avatar_hue: 200,
            timezone: null,
            email: null,
            avatar_path: null,
            created_at: 0,
          };
        case 'begin_save_document':
        case 'write_save_chunk':
        case 'commit_save_document':
        case 'save_document':
        case 'add_recent_file':
        case 'set_window_dirty':
          return null;
        case 'pick_save_path':
          return plan.pickReturns;
        default:
          return null;
      }
    };
    w.__TAURI__ = {
      core: { invoke },
      window: {
        getCurrentWindow: () => ({
          setTitle: async () => undefined,
          show: async () => undefined,
          unminimize: async () => undefined,
          setFocus: async () => undefined,
          onDragDropEvent: async () => () => undefined,
        }),
      },
    };
    w.__TAURI_INTERNALS__ = { invoke, transformCallback: () => 0 };
  }, initialPick);
}

const PK_BYTES = [0x50, 0x4b, 0x03, 0x04, 0x05, 0x06];

/** Filter the recorded log to just the save-pipeline commands, in order. */
async function saveCommandSequence(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pipeline = new Set([
      'begin_save_document',
      'write_save_chunk',
      'commit_save_document',
      'pick_save_path',
      'add_recent_file',
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__invokeLog as InvokeEntry[])
      .filter((e) => pipeline.has(e.cmd))
      .map((e) => e.cmd);
  });
}

interface EditorCase {
  name: 'docx' | 'sheets';
  url: string;
  boundPath: string;
  pickedPath: string;
  bootWaitMs: number;
}

const EDITORS: EditorCase[] = [
  {
    name: 'docx',
    url: '/docx/index.html',
    boundPath: '/mock/path/test-document.docx',
    pickedPath: '/mock/path/new-location.docx',
    bootWaitMs: 1500,
  },
  {
    name: 'sheets',
    url: '/sheets/index.html',
    boundPath: '/mock/path/test-workbook.xlsx',
    pickedPath: '/mock/path/new-location.xlsx',
    bootWaitMs: 2000,
  },
];

for (const ed of EDITORS) {
  test.describe(`Save flows — ${ed.name}`, () => {
    /**
     * 4. ATOMIC COMMIT ORDER — a normal save (bound path) must fire
     *    begin_save_document → write_save_chunk(s) → commit_save_document
     *    in that order. If the temp-file swap (commit) ran before the
     *    chunks, or the begin were skipped, a crash mid-save could leave
     *    a truncated file in place. This nails the ordering.
     */
    test('save fires begin → write → commit in order', async ({ page }) => {
      await installRecorder(page, ed.pickedPath);
      await page.goto(`${ed.url}?desk=1&file=${encodeURIComponent(ed.boundPath)}`, {
        waitUntil: 'load',
      });
      await page.waitForTimeout(ed.bootWaitMs);

      const result = await page.evaluate(async (bytes) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = (window as any).__deskApp__;
        const written = await b.save(new Uint8Array(bytes).buffer);
        return { written };
      }, PK_BYTES);

      expect(result.written, 'save should return the bound path').toBe(ed.boundPath);

      const seq = await saveCommandSequence(page);
      // Drop pick/add_recent noise (shouldn't appear for a bound save).
      const writePipeline = seq.filter((c) => c.startsWith('begin') || c.startsWith('write') || c.startsWith('commit'));
      expect(writePipeline[0], 'first pipeline call must be begin_save_document').toBe('begin_save_document');
      expect(writePipeline.at(-1), 'last pipeline call must be commit_save_document').toBe('commit_save_document');
      // At least one chunk write, and it must sit between begin and commit.
      const beginIdx = writePipeline.indexOf('begin_save_document');
      const commitIdx = writePipeline.indexOf('commit_save_document');
      const writeIdx = writePipeline.indexOf('write_save_chunk');
      expect(writeIdx, 'write_save_chunk must be present').toBeGreaterThan(-1);
      expect(beginIdx).toBeLessThan(writeIdx);
      expect(writeIdx).toBeLessThan(commitIdx);

      // A bound save must not have prompted for a path.
      expect(seq, 'bound save must not call pick_save_path').not.toContain('pick_save_path');
    });

    /**
     * 1. SAVE → SAVE AS → SAVE rebinds path (the #1 data-loss guard).
     *    After Save As picks a NEW path, the bridge must rebind
     *    `filePath`, so a subsequent plain Save writes to the NEW path —
     *    not the original. If rebinding regressed, the user's "Save As to
     *    a new file, keep editing, hit Save" flow would silently keep
     *    overwriting the ORIGINAL file.
     */
    test('Save As rebinds path so a later Save targets the new path', async ({ page }) => {
      await installRecorder(page, ed.pickedPath);
      await page.goto(`${ed.url}?desk=1&file=${encodeURIComponent(ed.boundPath)}`, {
        waitUntil: 'load',
      });
      await page.waitForTimeout(ed.bootWaitMs);

      const result = await page.evaluate(async (bytes) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = (window as any).__deskApp__;
        const buf = () => new Uint8Array(bytes).buffer;
        // 1) First Save → writes to the bound (original) path.
        const firstSave = await b.save(buf());
        // 2) Save As → user picks a new path (pick_save_path mock).
        const savedAs = await b.saveAs('Untitled', buf());
        // Snapshot the log boundary so we can isolate the THIRD call.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logBeforeThird = (window as any).__invokeLog.length;
        // 3) Plain Save again → must hit the NEW path.
        const secondSave = await b.save(buf());
        return {
          firstSave,
          savedAs,
          secondSave,
          filePathAfter: b.filePath,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thirdCallSlice: ((window as any).__invokeLog as InvokeEntry[]).slice(logBeforeThird),
        };
      }, PK_BYTES);

      expect(result.firstSave, 'first save targets the original path').toBe(ed.boundPath);
      expect(result.savedAs, 'Save As returns the picked path').toBe(ed.pickedPath);
      expect(result.filePathAfter, 'bridge.filePath must rebind to the picked path').toBe(ed.pickedPath);
      expect(result.secondSave, 'second Save must return the NEW path, not the original').toBe(ed.pickedPath);

      // The decisive assertion: the THIRD save's write commands target
      // the NEW path. If rebinding regressed, these would still be the
      // original boundPath — the silent data-loss bug.
      const thirdBegin = result.thirdCallSlice.find((e) => e.cmd === 'begin_save_document');
      const thirdWrite = result.thirdCallSlice.find((e) => e.cmd === 'write_save_chunk');
      const thirdCommit = result.thirdCallSlice.find((e) => e.cmd === 'commit_save_document');
      expect(thirdBegin?.args.path, 'rebound save begin path').toBe(ed.pickedPath);
      expect(thirdWrite?.args.path, 'rebound save write path').toBe(ed.pickedPath);
      expect(thirdCommit?.args.path, 'rebound save commit path').toBe(ed.pickedPath);
      // And it must NOT have re-prompted for a path (it's bound now).
      expect(
        result.thirdCallSlice.find((e) => e.cmd === 'pick_save_path'),
        'rebound Save must not prompt again',
      ).toBeUndefined();
    });

    /**
     * 2. UNTITLED SAVE CANCEL — for a brand-new (untitled) document,
     *    Save delegates to Save As. If the user cancels the picker
     *    (pick_save_path → null), the document must stay UNSAVED:
     *    no commit, filePath stays null, save() resolves null.
     *    A regression here would mark a never-written doc as "saved".
     */
    test('cancelling the Save As picker leaves the document unsaved', async ({ page }) => {
      // No bound file => untitled. Picker returns null (user cancelled).
      await installRecorder(page, null);
      await page.goto(`${ed.url}?desk=1`, { waitUntil: 'load' });
      await page.waitForTimeout(ed.bootWaitMs);

      const result = await page.evaluate(async (bytes) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = (window as any).__deskApp__;
        const written = await b.save(new Uint8Array(bytes).buffer);
        return { written, filePathAfter: b.filePath };
      }, PK_BYTES);

      expect(result.written, 'cancelled save must resolve null (not a path)').toBeNull();
      expect(result.filePathAfter, 'filePath must stay null after cancel').toBeNull();

      const seq = await saveCommandSequence(page);
      expect(seq, 'cancelled save must have prompted via pick_save_path').toContain('pick_save_path');
      expect(seq, 'cancelled save must NOT commit anything').not.toContain('commit_save_document');
      expect(seq, 'cancelled save must NOT begin a write').not.toContain('begin_save_document');
    });

    /**
     * 3. SAVE FAILURE SURFACES — if a write/commit invoke rejects (disk
     *    full, permission denied, file locked), save() must REJECT and
     *    propagate the error so the editor can show a failed-save toast.
     *    It must never resolve as if the save succeeded — that's the
     *    worst case (user thinks their data is safe on disk when it
     *    isn't). We arm the failure on `write_save_chunk`, the write
     *    step present in every build of the bridge, so this exercises
     *    the real error-propagation contract regardless of whether the
     *    atomic-commit step is in the currently-deployed editor bundle.
     */
    test('a rejected write makes save() reject (does not resolve success)', async ({ page }) => {
      await installRecorder(page, ed.pickedPath);
      await page.goto(`${ed.url}?desk=1&file=${encodeURIComponent(ed.boundPath)}`, {
        waitUntil: 'load',
      });
      await page.waitForTimeout(ed.bootWaitMs);

      const outcome = await page.evaluate(async (bytes) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        // Arm the failure on the write step (the disk write that can fail).
        w.__mockPlan.rejectOn = 'write_save_chunk';
        w.__mockPlan.rejectWith = 'permission denied (EACCES)';
        const b = w.__deskApp__;
        try {
          const written = await b.save(new Uint8Array(bytes).buffer);
          return { resolved: true, written, error: null as string | null };
        } catch (err) {
          return { resolved: false, written: null, error: String(err) };
        }
      }, PK_BYTES);

      expect(outcome.resolved, 'save() MUST reject when a write fails — never resolve success').toBe(false);
      expect(outcome.error, 'the rejection should carry the underlying error').toContain('EACCES');
    });
  });
}
