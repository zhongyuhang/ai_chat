# Local AI Novel Studio P3 Publication Quality And Complete UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add serial/publication quality gates, bounded targeted revision, manuscript analytics and export, complete responsive/accessibility behavior, and long-project recovery verification.

**Architecture:** Quality checks produce immutable reports and bounded patch proposals attached to generation runs. Deterministic checks and typed model-assisted reviews feed a single score contract; accepted prose changes only through revision APIs. Dashboard, export, responsive UX, and scale tests complete the local product.

**Tech Stack:** TypeScript, React, Fastify, Zod, Vitest, Playwright, axe-core, `docx`, DeepSeek provider adapter.

**Spec:** `docs/superpowers/specs/2026-08-24-local-ai-novel-studio-design.md`

## Global Constraints

- Serial default acceptance threshold is 80/100.
- Publication default acceptance threshold is 88/100.
- Fatal continuity defects block normal acceptance regardless of score.
- A below-threshold or fatal report may be explicitly waived; the waiver and author note are recorded.
- Automatic revision is bounded to one through five passes and defaults to three.
- Review reports cite exact revision IDs and passage ranges.
- Targeted patches reject stale source revisions and never regenerate frozen passages.
- Export reads accepted revisions only unless the user explicitly exports a candidate package.
- All core workflows remain usable at 390 CSS pixels and by keyboard.

---

## File Map

- `studio/src/shared/contracts/quality.ts`: score, issue, fatal defect, waiver, and report contracts.
- `studio/src/server/quality/deterministic-lint.ts`: local punctuation, viewpoint, repetition, and structure checks.
- `studio/src/server/quality/continuity-review.ts`: canon, timeline, knowledge, and causal checks.
- `studio/src/server/quality/quality-scorer.ts`: exact 100-point weighting and thresholds.
- `studio/src/server/quality/revision-pipeline.ts`: bounded critique/patch/rescore loop.
- `studio/src/server/quality/patch-applier.ts`: stale-safe targeted text patches and frozen ranges.
- `studio/src/server/dashboard/manuscript-analytics.ts`: project metrics.
- `studio/src/server/export/*`: Markdown, TXT, JSON, and DOCX exports.
- `studio/src/client/quality/*`: reports, cited issues, diffs, waivers, and acceptance.
- `studio/src/client/dashboard/*`: manuscript status and quality trends.
- `studio/src/client/layout/*`: desktop focus layout and mobile drawers.

---

### Task 1: Define Quality Reports, Fatal Defects, And Exact Scoring

**Files:**
- Create: `studio/src/shared/contracts/quality.ts`
- Create: `studio/src/server/quality/quality-scorer.ts`
- Create: `studio/src/server/quality/deterministic-lint.ts`
- Create: `studio/tests/server/quality-scorer.test.ts`

**Interfaces:**
- Produces: `QualityReportSchema`, `QualityIssueSchema`, `QualityWaiverSchema`.
- Produces: `scoreQuality(input): QualityScoreResult` and `canAccept(report, mode): AcceptanceDecision`.
- Produces deterministic issues with exact `revisionId`, `start`, `end`, `excerpt`, `category`, `severity`, and `message`.

- [ ] **Step 1: Write failing score and fatal-defect tests**

```ts
it('uses the approved 100-point weights', () => {
  const result = scoreQuality(perfectCategoryScores());
  expect(result.total).toBe(100);
  expect(Object.values(result.weighted).reduce((sum, value) => sum + value, 0)).toBe(100);
});

it('blocks publication acceptance when a fatal defect remains', () => {
  const report = qualityReport({ total: 96, fatalDefects: [fatal('TIMELINE_IMPOSSIBLE')] });
  expect(canAccept(report, 'publication')).toEqual({ allowed: false, reason: 'FATAL_DEFECTS' });
});

it('allows an explicit recorded waiver without deleting the report', () => {
  const report = qualityReport({ total: 70, fatalDefects: [fatal('CANON_CONTRADICTION')] });
  const decision = canAccept(report, 'publication', { author: 'local-user', note: '有意设置的不可靠叙述', createdAt: now });
  expect(decision.allowed).toBe(true);
  expect(decision.waived).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/quality-scorer.test.ts`

- [ ] **Step 3: Implement the exact weights**

```ts
export const QUALITY_WEIGHTS = {
  plotLogic: 15,
  character: 15,
  prose: 15,
  continuity: 10,
  viewpoint: 10,
  pacing: 10,
  dialogue: 10,
  serialHook: 5,
  originality: 5,
  mechanics: 5,
} as const;
```

Each category input is `0..10`; weighted contribution is `round(score / 10 * weight, 2)`. `canAccept` selects the project threshold and then checks fatal defects before the numeric score.

- [ ] **Step 4: Implement deterministic lint with passage citations**

Required first-release checks: repeated paragraph, repeated phrase cluster, unmatched Chinese quote marks, mixed full/half-width punctuation, empty chapter, viewpoint label drift when explicit viewpoint is configured, chapter length outside configured tolerance, and missing chapter heading on export. Deterministic lint does not invent semantic defects.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/quality-scorer.test.ts`

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- studio/src/shared/contracts/quality.ts studio/src/server/quality studio/tests/server/quality-scorer.test.ts
git commit -m "feat: define serial and publication quality gates"
```

---

### Task 2: Implement Continuity Review And Bounded Targeted Revision

**Files:**
- Create: `studio/src/server/quality/continuity-review.ts`
- Create: `studio/src/server/quality/patch-applier.ts`
- Create: `studio/src/server/quality/revision-pipeline.ts`
- Create: `studio/src/server/quality/quality-routes.ts`
- Create: `studio/tests/server/revision-pipeline.test.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces: `reviewContinuity({ project, canon, chapter, neighboringChapters })`.
- Produces: `applyPatches({ source, sourceRevisionId, currentRevisionId, frozenRanges, patches })`.
- Produces: `runRevisionPipeline({ runId, maxPasses, modes })`.
- Produces quality review, retry-pass, accept, and waive routes.

- [ ] **Step 1: Write failing stale/frozen/bounded-loop tests**

```ts
it('rejects patches against a stale chapter revision', () => {
  expect(() => applyPatches({
    source: '当前正文', sourceRevisionId: 'rev_old', currentRevisionId: 'rev_new', frozenRanges: [], patches: [],
  })).toThrowError(expect.objectContaining({ code: 'SOURCE_REVISION_CHANGED' }));
});

it('rejects a patch intersecting frozen prose', () => {
  expect(() => applyPatches({
    source: '不可修改的句子。其余正文。', sourceRevisionId: 'rev_1', currentRevisionId: 'rev_1',
    frozenRanges: [{ start: 0, end: 8 }], patches: [{ start: 2, end: 6, replacement: '修改' }],
  })).toThrowError(expect.objectContaining({ code: 'FROZEN_RANGE' }));
});

it('stops after the configured maximum revision passes', async () => {
  const result = await runTestPipeline({ maxPasses: 3, scores: [60, 70, 75, 79] });
  expect(result.passes).toHaveLength(3);
  expect(result.status).toBe('below-threshold');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/revision-pipeline.test.ts`

- [ ] **Step 3: Implement deterministic continuity facts before model critique**

Compare named entity facts, character current state, explicit ages, locations, possessions, injuries, knowledge events, timeline dependencies, and foreshadowing deadlines. Emit fatal codes only for direct validated contradictions; uncertain matches become warnings.

- [ ] **Step 4: Implement targeted patches from end to start**

Validate sorted, non-overlapping ranges against source length and source excerpts. Reject intersections with frozen ranges. Apply patches in descending `start` order so offsets remain stable. Return patched text plus a change manifest.

- [ ] **Step 5: Implement the bounded review loop**

Each pass stores critique prompt version, source revision, issues, proposed patches, patched candidate revision, new report, token usage, and stop reason. Stop on threshold, user cancellation, fatal provider error, no applicable patches, or `maxPasses`.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/revision-pipeline.test.ts`

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- studio/src/server/quality studio/tests/server/revision-pipeline.test.ts studio/src/server/app.ts
git commit -m "feat: add bounded publication revision pipeline"
```

---

### Task 3: Build Quality Review And Acceptance UI

**Files:**
- Create: `studio/src/client/quality/QualityPanel.tsx`
- Create: `studio/src/client/quality/ScoreBreakdown.tsx`
- Create: `studio/src/client/quality/IssueList.tsx`
- Create: `studio/src/client/quality/PatchDiff.tsx`
- Create: `studio/src/client/quality/WaiverDialog.tsx`
- Create: `studio/tests/e2e/quality-review.spec.ts`
- Modify: `studio/src/client/studio/NovelStudio.tsx`

**Interfaces:**
- Consumes quality and revision pipeline routes.
- Produces actions `开始连载审校`, `开始出版审校`, `应用此修改`, `重试本轮`, `采用达标稿`, and `记录理由后采用`.

- [ ] **Step 1: Write a failing quality workflow E2E test**

```ts
test('cites issues, revises a candidate, and requires a waiver below threshold', async ({ page }) => {
  await openChapter(page, projectId, chapterId);
  await page.getByRole('button', { name: '出版审校' }).click();
  await expect(page.getByText('总分 84 / 100')).toBeVisible();
  await page.getByText('人物知识冲突').click();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toHaveJSProperty('selectionStart', issueStart);
  await expect(page.getByRole('button', { name: '采用达标稿' })).toBeDisabled();
  await page.getByRole('button', { name: '记录理由后采用' }).click();
  await page.getByLabel('采用理由').fill('此处为有意的不可靠叙述');
  await page.getByRole('button', { name: '确认采用并记录' }).click();
  await expect(page.getByText('已记录人工豁免')).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/quality-review.spec.ts`

- [ ] **Step 3: Implement cited issue navigation and score breakdown**

Each issue shows severity, category, message, excerpt, source revision, and status. Clicking focuses the exact editor range only when revision IDs match; otherwise show `报告基于旧版本` and offer rerun.

- [ ] **Step 4: Implement patch diff and acceptance states**

Show before/after text, affected ranges, frozen-range conflicts, pass count, stop reason, and quality change. Normal acceptance is disabled below threshold or with fatal defects. Waiver requires a non-empty author note and records the report unchanged.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio run test:e2e -- tests/e2e/quality-review.spec.ts`

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- studio/src/client/quality studio/tests/e2e/quality-review.spec.ts studio/src/client/studio/NovelStudio.tsx
git commit -m "feat: add publication review and acceptance UI"
```

---

### Task 4: Add Manuscript Dashboard And Publication Exports

**Files:**
- Create: `studio/src/server/dashboard/manuscript-analytics.ts`
- Create: `studio/src/server/dashboard/dashboard-routes.ts`
- Create: `studio/src/server/export/manuscript-model.ts`
- Create: `studio/src/server/export/markdown-export.ts`
- Create: `studio/src/server/export/text-export.ts`
- Create: `studio/src/server/export/json-export.ts`
- Create: `studio/src/server/export/docx-export.ts`
- Create: `studio/src/server/export/export-routes.ts`
- Create: `studio/src/client/dashboard/ProjectDashboard.tsx`
- Create: `studio/src/client/export/ExportDialog.tsx`
- Create: `studio/tests/server/export.test.ts`
- Create: `studio/tests/e2e/dashboard-export.spec.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces analytics for word counts, accepted/draft state, POV distribution, appearances, unresolved foreshadowing, timeline conflicts, quality trends, and backup health.
- Produces `buildManuscript(projectId, repository)` and format renderers.

Add the `docx` runtime dependency and a ZIP-reading test dependency used only to inspect generated DOCX text during tests.

- [ ] **Step 1: Write failing accepted-only export tests**

```ts
it('exports accepted revisions in volume/chapter order and excludes candidates', async () => {
  const manuscript = await buildManuscript(projectId, repository);
  expect(manuscript.volumes[0].chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
  expect(JSON.stringify(manuscript)).not.toContain('未采用候选正文');
});

it('creates a readable DOCX with headings and body paragraphs', async () => {
  const bytes = await renderDocx(manuscriptFixture);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(await extractDocxText(bytes)).toContain('第一卷\n第一章\n正文第一段');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/export.test.ts`

- [ ] **Step 3: Implement a format-neutral manuscript model**

Read accepted chapter revisions in explicit outline order. Reject export when an outline chapter points to a missing accepted file unless `includePlaceholders` is explicitly selected. Never include API keys, prompts, run internals, or candidates in manuscript formats.

- [ ] **Step 4: Implement four exporters**

- Markdown: volume/chapter headings and original Markdown body.
- TXT: clean headings and plain paragraphs.
- JSON: validated portable project package with schema version and checksums.
- DOCX: title page, volume heading, chapter heading, first-line indentation, page breaks, Chinese font defaults, and page numbers.

- [ ] **Step 5: Implement dashboard and export dialog**

Dashboard queries analytics; export dialog selects format, accepted scope, volumes, title-page metadata, and output filename. Browser receives a download only after the server has produced a complete artifact.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/export.test.ts && npm --prefix studio run test:e2e -- tests/e2e/dashboard-export.spec.ts`

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- studio/src/server/dashboard studio/src/server/export studio/src/client/dashboard studio/src/client/export studio/tests/server/export.test.ts studio/tests/e2e/dashboard-export.spec.ts studio/src/server/app.ts
git commit -m "feat: add manuscript analytics and exports"
```

---

### Task 5: Complete Desktop Focus Mode, Mobile Drawers, And Accessibility

**Files:**
- Create: `studio/src/client/layout/AppShell.tsx`
- Create: `studio/src/client/layout/ProjectDrawer.tsx`
- Create: `studio/src/client/layout/InspectorDrawer.tsx`
- Create: `studio/src/client/layout/useResponsiveLayout.ts`
- Create: `studio/src/client/styles/tokens.css`
- Create: `studio/src/client/styles/layout.css`
- Create: `studio/tests/e2e/responsive-accessibility.spec.ts`
- Modify: all workspace shells to use `AppShell`.

**Interfaces:**
- Produces desktop three-region layout with default collapsed inspector and mobile one-column layout.
- Produces `aria-live` regions for save, generation, quality, recovery, and error status.

Add `@axe-core/playwright` as a development dependency before the RED run; axe executes only in tests and is not shipped in the browser bundle.

- [ ] **Step 1: Write failing 390px and keyboard tests**

```ts
test.use({ viewport: { width: 390, height: 844 } });

test('opens project and settings drawers without horizontal overflow', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.getByRole('button', { name: '项目与章节' }).click();
  await expect(page.getByRole('dialog', { name: '项目与章节' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '设置与上下文' }).click();
  await expect(page.getByRole('dialog', { name: '设置与上下文' })).toBeVisible();
});

test('shows message actions on keyboard focus', async ({ page }) => {
  await openTheatre(page, sessionId);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '重试回复' })).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/responsive-accessibility.spec.ts`

- [ ] **Step 3: Implement responsive shell without specificity conflicts**

Use data attributes on `AppShell` and one media-query definition for each breakpoint. On mobile, side regions are removed from grid flow and mounted in modal drawers. Reset persisted desktop collapse state when calculating mobile grid; never reuse a desktop grid-column declaration on mobile.

- [ ] **Step 4: Implement keyboard and live-state behavior**

All icon controls receive text accessible names. Focus is trapped in drawers and restored to the trigger on close. Hover actions also use `:focus-within`. Streaming areas use `aria-busy`; status updates use polite live regions, while blocking persistence failure uses assertive status.

- [ ] **Step 5: Add axe checks for core pages**

Run axe against Project Center, Novel Studio, Character Theatre, Canon Workspace, Quality Panel, and mobile drawers. Fail on serious or critical violations; document lower-severity findings with explicit accepted rationale rather than suppressing rules globally.

- [ ] **Step 6: Verify GREEN at desktop and mobile widths**

Run: `npm --prefix studio run test:e2e -- tests/e2e/responsive-accessibility.spec.ts`

- [ ] **Step 7: Commit Task 5**

```powershell
git add -- studio/src/client/layout studio/src/client/styles studio/tests/e2e/responsive-accessibility.spec.ts studio/src/client
git commit -m "feat: complete responsive accessible studio UX"
```

---

### Task 6: Prove Long-Project Scale, Crash Recovery, And Release Quality

**Files:**
- Create: `studio/tests/fixtures/large-project.ts`
- Create: `studio/tests/server/scale-recovery.test.ts`
- Create: `studio/tests/e2e/recovery.spec.ts`
- Create: `studio/tests/e2e/full-publication-flow.spec.ts`
- Modify: `studio/package.json`
- Modify: root `README.md`
- Create: `docs/operations/local-data-and-recovery.md`

**Interfaces:**
- Produces `createLargeProject({ chapters, characters, worldBookEntries, chineseCharacters })`.
- Produces final commands `test:unit`, `test:integration`, `test:e2e`, `test:scale`, and `verify`.

- [ ] **Step 1: Write failing scale and crash-recovery tests**

```ts
it('loads and analyzes a 240 chapter million-character project', async () => {
  const project = await createLargeProject({ chapters: 240, characters: 80, worldBookEntries: 1_000, chineseCharacters: 1_000_000 });
  const started = performance.now();
  const analytics = await analyzeProject(project.id, repository);
  expect(analytics.chapterCount).toBe(240);
  expect(analytics.chineseCharacters).toBeGreaterThanOrEqual(1_000_000);
  expect(performance.now() - started).toBeLessThan(5_000);
});

it('keeps the prior valid file when replacement fails', async () => {
  await repository.saveChapterRevision(projectId, chapterId, '原正文', metadata);
  fileOps.failNextRename(new Error('simulated crash'));
  await expect(repository.saveChapterRevision(projectId, chapterId, '新正文', metadata)).rejects.toThrow('simulated crash');
  expect(await repository.readChapter(projectId, chapterId)).toBe('原正文');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:scale`

- [ ] **Step 3: Optimize only measured bottlenecks**

Use paged chapter metadata, lazy accepted-body loading, cached analytics keyed by file revision/checksum, indexed normalized world-book trigger terms, and per-chapter state snapshots. Each accepted chapter snapshot records character state, relationship deltas, timeline events, revealed knowledge, active goals, unresolved hooks, and foreshadowing changes with source revision IDs. Do not add a database or semantic vector layer during this phase.

- [ ] **Step 4: Implement browser recovery E2E**

Test unsaved IndexedDB journal after reload, interrupted SSE run, stale server revision conflict, corrupt current JSON with valid backup, manual revision restore, and legacy migration rollback. Recovery never auto-applies a draft over a newer accepted revision.

- [ ] **Step 5: Implement the complete publication flow E2E**

Create a both-mode project, define canon and world book, create outline and scene, generate two chapter candidates through a fake provider, accept one, run serial review, run publication review, apply one targeted patch, accept at threshold, export DOCX, create a theatre session, branch it, and convert the selected branch into the next scene card.

- [ ] **Step 6: Register and run the final verification command**

```json
{
  "scripts": {
    "verify": "npm run check && npm test && npm run studio:check && npm --prefix studio run test:unit && npm --prefix studio run test:integration && npm --prefix studio run test:e2e && npm --prefix studio run test:scale && npm run studio:build"
  }
}
```

Run: `npm run verify && npm audit --omit=dev && npm --prefix studio audit --omit=dev`

Expected: every command exits 0, no unexplained warnings, zero known production vulnerabilities, and production build succeeds.

- [ ] **Step 7: Document local data and recovery**

Document the data root, project structure, backup retention, manual backup, restore workflow, migration rollback, safe shutdown, API key handling, and how to move a project to another computer without exposing logs or `.env`.

- [ ] **Step 8: Commit P3 completion**

```powershell
git add -- studio/tests studio/package.json studio/package-lock.json package.json package-lock.json README.md docs/operations/local-data-and-recovery.md
git commit -m "test: complete local novel studio release gate"
```

## P3 Completion Gate

- Score weights total 100 and thresholds match the approved design.
- Fatal defects block normal acceptance and waivers remain auditable.
- Revision loops stop at the configured pass limit.
- Stale or frozen-range patches cannot alter accepted prose.
- Reports cite exact passages and navigate only against matching revisions.
- Dashboard reflects accepted project state and backup health.
- Markdown, TXT, JSON, and DOCX exports use accepted revisions in outline order.
- Project navigation and settings are fully usable at 390px without overflow.
- No action is hover-only; critical state changes are announced accessibly.
- A 240-chapter, 1,000,000-character fixture passes the defined analysis target and cross-volume fact lookup returns confirming chapter/revision sources.
- Interrupted generation, stale edits, failed writes, corrupt metadata, legacy migration, and browser refresh are recoverable.
- The complete both-mode publication flow passes through a fake DeepSeek provider.
- Root and studio verification, builds, and production dependency audits pass.
