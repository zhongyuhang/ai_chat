# Local AI Novel Studio P2 Dual Workspaces And AI Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete Novel Studio and Character Theatre workspaces sharing confirmed project canon, with branching, candidate drafts, material conversion, and recoverable AI generation runs.

**Architecture:** Extend the P1 project core with domain services for outline hierarchy, canon proposals, message graphs, and generation tasks. React routes expose focused editors while all accepted persistence and AI orchestration remain server-owned. Theatre changes are proposals until explicitly promoted into project canon.

**Tech Stack:** React, TypeScript, Fastify, Zod, TanStack Query, CodeMirror 6, Vitest, Playwright, DeepSeek provider adapter from P1.

**Spec:** `docs/superpowers/specs/2026-08-24-local-ai-novel-studio-design.md`

## Global Constraints

- Novel Studio and Character Theatre use the same confirmed characters, relationships, world book, timeline, and foreshadowing records.
- Theatre messages and AI extractions cannot mutate confirmed canon without user approval.
- Editing, retrying, and branching never delete sibling branches.
- Candidate prose never replaces accepted prose until an explicit accept action.
- Every active generation writes only through its run ID and target ID.
- Navigation does not redirect stream deltas to the currently visible project, chapter, or message.
- All generation tasks display their context manifest and remain cancellable.

---

## File Map

- `studio/src/server/outlines/*`: story bible, volume, chapter, and scene-card repository/services.
- `studio/src/server/canon/*`: character, relationship, world-book, timeline, foreshadowing, and proposal services.
- `studio/src/server/theatre/message-graph.ts`: immutable branch graph operations.
- `studio/src/server/theatre/theatre-repository.ts`: sessions, state, memory, and proposals.
- `studio/src/server/generation/task-compiler.ts`: typed tasks for plans, chapters, rewrites, and roleplay.
- `studio/src/server/generation/generation-coordinator.ts`: candidate and run lifecycle.
- `studio/src/server/material/material-converter.ts`: theatre-to-scene/chapter/canon conversions.
- `studio/src/client/studio/*`: Novel Studio UI.
- `studio/src/client/theatre/*`: Character Theatre UI.
- `studio/src/client/canon/*`: shared canon editors and world-book hit inspector.

---

### Task 1: Implement Outline Hierarchy And Canon Proposal Services

**Files:**
- Create: `studio/src/server/outlines/outline-service.ts`
- Create: `studio/src/server/canon/canon-service.ts`
- Create: `studio/src/server/canon/proposal-service.ts`
- Create: `studio/src/server/canon/canon-routes.ts`
- Create: `studio/tests/server/canon-service.test.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces: `OutlineService` methods `getTree`, `saveStoryBible`, `saveVolume`, `saveChapterOutline`, `saveSceneCard`, and `reorder`.
- Produces: `CanonService` methods `getBundle`, `saveCharacter`, `saveRelationship`, `saveWorldBookEntry`, `saveTimelineEvent`, and `saveForeshadowing`.
- Produces: `ProposalService.create`, `list`, `accept`, and `reject`.

- [ ] **Step 1: Write failing tests proving proposals cannot mutate canon**

```ts
it('keeps AI-extracted canon separate until acceptance', async () => {
  const proposal = await proposals.create(projectId, {
    kind: 'character-update', targetId: 'character_lin', patch: { currentState: { injured: true } }, source: { kind: 'chapter', id: 'chapter_003' },
  });
  expect((await canon.getBundle(projectId)).characters[0].currentState.injured).not.toBe(true);
  await proposals.accept(projectId, proposal.id);
  expect((await canon.getBundle(projectId)).characters[0].currentState.injured).toBe(true);
});

it('rejects a timeline event whose dependency occurs later', async () => {
  await expect(canon.saveTimelineEvent(projectId, impossibleEvent)).rejects.toMatchObject({ code: 'TIMELINE_DEPENDENCY_INVALID' });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/canon-service.test.ts`

Expected: FAIL because canon and proposal services are missing.

- [ ] **Step 3: Implement typed canon bundle persistence**

Store each canon collection through the P1 repository and Zod contracts. Proposal acceptance reads the latest target, applies only schema-allowed patch paths, validates the complete updated record, creates a backup, and records the proposal ID in change metadata.

- [ ] **Step 4: Implement hierarchy invariants**

Volume order is unique within a project; chapter order is unique within a volume; scene-card order is unique within a chapter. Reorder accepts the complete ordered ID list and rejects missing, duplicate, or foreign IDs.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/canon-service.test.ts && npm run studio:check`

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- studio/src/server/outlines studio/src/server/canon studio/tests/server/canon-service.test.ts studio/src/server/app.ts
git commit -m "feat: add outline and confirmed canon services"
```

---

### Task 2: Implement The Theatre Message Graph

**Files:**
- Create: `studio/src/shared/contracts/theatre.ts`
- Create: `studio/src/server/theatre/message-graph.ts`
- Create: `studio/src/server/theatre/theatre-repository.ts`
- Create: `studio/src/server/theatre/theatre-routes.ts`
- Create: `studio/tests/server/message-graph.test.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces: `createMessageGraph(rootMessage)`, `appendMessage`, `editAndBranch`, `retryFrom`, `selectBranch`, `getActivePath`, and `deleteLeaf`.
- Produces theatre routes for sessions, nodes, branch selection, pinned memory, and state proposals.

- [ ] **Step 1: Write failing branch-preservation tests**

```ts
it('editing a prior message creates a sibling branch without deleting history', () => {
  let graph = createMessageGraph(userNode('u1', '原问题'));
  graph = appendMessage(graph, 'u1', assistantNode('a1', '原回答'));
  graph = editAndBranch(graph, 'u1', userNode('u2', '修改后的问题'));
  graph = appendMessage(graph, 'u2', assistantNode('a2', '新回答'));
  expect(graph.nodes.u1.children).toEqual(['a1', 'u2']);
  expect(getActivePath(selectBranch(graph, 'u1', 'a1')).map((node) => node.id)).toEqual(['u1', 'a1']);
  expect(getActivePath(selectBranch(graph, 'u1', 'u2')).map((node) => node.id)).toEqual(['u1', 'u2', 'a2']);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/message-graph.test.ts`

Expected: FAIL with missing message-graph module.

- [ ] **Step 3: Implement immutable graph operations**

Every operation returns a new validated graph. A node stores `id`, `parentId`, ordered `children`, `role`, `content`, `createdAt`, optional `runId`, and immutable revision metadata. Only leaf deletion is allowed; deleting a branch requires a separate subtree-archive operation added in P3 recovery UI.

- [ ] **Step 4: Persist theatre state independently of confirmed canon**

Session state includes participants, user persona, narrator mode, active node, pinned memory, emotional/relationship state, and pending canon proposals. The context orchestrator consumes the active path only.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/message-graph.test.ts`

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- studio/src/shared/contracts/theatre.ts studio/src/server/theatre studio/tests/server/message-graph.test.ts studio/src/server/app.ts
git commit -m "feat: add branching character theatre sessions"
```

---

### Task 3: Compile Typed AI Tasks And Coordinate Candidate Runs

**Files:**
- Create: `studio/src/shared/contracts/tasks.ts`
- Create: `studio/src/server/generation/task-compiler.ts`
- Create: `studio/src/server/generation/generation-coordinator.ts`
- Create: `studio/tests/server/generation-coordinator.test.ts`
- Modify: `studio/src/server/generation/generation-routes.ts`

**Interfaces:**
- Produces task kinds `story-plan`, `volume-plan`, `chapter-plan`, `scene-plan`, `chapter-draft`, `continue`, `rewrite-selection`, `expand-selection`, `condense-selection`, `polish-selection`, and `theatre-reply`.
- Produces: `GenerationCoordinator.start(task)`, `cancel(runId)`, `resume(runId)`, `acceptCandidate(runId, candidateId)`, and `getRun(runId)`.

- [ ] **Step 1: Write failing target-isolation and acceptance tests**

```ts
it('never redirects deltas when the visible chapter changes', async () => {
  const run = await coordinator.start(chapterDraftTask('project_1', 'chapter_1'));
  visibleUiChapter = 'chapter_2';
  fakeProvider.emit(run.id, { type: 'content-delta', text: '第一章正文' });
  await fakeProvider.finish(run.id);
  expect((await coordinator.getRun(run.id)).candidates[0].content).toBe('第一章正文');
  expect(await repository.readChapter('project_1', 'chapter_2')).toBeNull();
});

it('does not replace accepted prose before explicit acceptance', async () => {
  const run = await completeCandidateRun('chapter_1', '候选正文');
  expect(await repository.readChapter('project_1', 'chapter_1')).toContain('原正文');
  await coordinator.acceptCandidate(run.id, run.candidates[0].id);
  expect(await repository.readChapter('project_1', 'chapter_1')).toContain('候选正文');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/generation-coordinator.test.ts`

- [ ] **Step 3: Implement task compilation**

Each task compiler selects an exact prompt manifest, target, expected output contract, context sources, candidate count `1..3`, requested output tokens, and post-processing steps. Selection rewrite tasks contain immutable source revision ID plus exact character offsets and selected text hash; reject stale edits with `SOURCE_REVISION_CHANGED`.

- [ ] **Step 4: Implement run-owned stream state**

Provider events append only to `run.candidates[candidateId]`. Run persistence checkpoints after bounded time or character deltas. Cancellation marks the candidate incomplete and preserves content. Acceptance calls the repository only after checking the run target and source revision.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/generation-coordinator.test.ts`

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- studio/src/shared/contracts/tasks.ts studio/src/server/generation studio/tests/server/generation-coordinator.test.ts
git commit -m "feat: coordinate isolated AI writing runs"
```

---

### Task 4: Build Shared Canon And Outline Editors

**Files:**
- Create: `studio/src/client/canon/CanonWorkspace.tsx`
- Create: `studio/src/client/canon/CharacterEditor.tsx`
- Create: `studio/src/client/canon/RelationshipEditor.tsx`
- Create: `studio/src/client/canon/WorldBookEditor.tsx`
- Create: `studio/src/client/canon/TimelineEditor.tsx`
- Create: `studio/src/client/canon/ForeshadowingEditor.tsx`
- Create: `studio/src/client/outlines/OutlineTree.tsx`
- Create: `studio/tests/e2e/canon-editors.spec.ts`
- Modify: `studio/src/client/App.tsx`

**Interfaces:**
- Consumes P2 canon and outline APIs.
- Produces shared routes `/projects/:projectId/canon` and `/projects/:projectId/outline`.
- Produces visible proposal states `待确认`, `已采用`, and `已拒绝`.

- [ ] **Step 1: Write a failing canon/world-book E2E test**

```ts
test('creates a character and previews a keyword world-book hit', async ({ page }) => {
  await openProject(page, projectId);
  await page.getByRole('link', { name: '设定库' }).click();
  await page.getByRole('button', { name: '新建角色' }).click();
  await page.getByLabel('姓名').fill('林默');
  await page.getByLabel('核心目标').fill('查清失踪案');
  await page.getByRole('button', { name: '保存角色' }).click();
  await page.getByRole('tab', { name: '世界书' }).click();
  await createKeywordEntry(page, { name: '旧王都', keyword: '王都', content: '王都已封锁十年。' });
  await page.getByLabel('触发预览文本').fill('林默抵达王都。');
  await expect(page.getByText('命中：王都')).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/canon-editors.spec.ts`

- [ ] **Step 3: Implement form editors from shared Zod constraints**

Use explicit labels, field errors, unsaved-change protection, and server revision IDs. World-book editor shows activation, scope, priority, token limit, matched term, and inclusion reason. No save occurs during a preview.

- [ ] **Step 4: Implement outline tree operations**

Allow story bible, volumes, chapters, and scene cards to be created, renamed, and reordered. Reorder sends complete sibling ID order and restores the previous UI order on API failure.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio run test:e2e -- tests/e2e/canon-editors.spec.ts && npm run studio:check`

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- studio/src/client/canon studio/src/client/outlines studio/tests/e2e/canon-editors.spec.ts studio/src/client/App.tsx
git commit -m "feat: add shared canon and outline editors"
```

---

### Task 5: Deliver Novel Studio Editing And Candidate Comparison

**Files:**
- Create: `studio/src/client/studio/NovelStudio.tsx`
- Create: `studio/src/client/studio/ChapterEditor.tsx`
- Create: `studio/src/client/studio/GenerationToolbar.tsx`
- Create: `studio/src/client/studio/ContextPreview.tsx`
- Create: `studio/src/client/studio/CandidateComparison.tsx`
- Create: `studio/src/client/studio/RevisionHistory.tsx`
- Create: `studio/tests/e2e/novel-studio.spec.ts`
- Modify: `studio/src/client/App.tsx`

**Interfaces:**
- Consumes outline, chapter, context-preview, run SSE, candidate acceptance, and revision APIs.
- Produces route `/projects/:projectId/studio/:chapterId`.

This task adds the exact editor dependencies `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, and `@uiw/react-codemirror` to `studio/package.json` before the RED run. No rich-text document model is introduced; Markdown remains the stored source.

- [ ] **Step 1: Write a failing chapter candidate E2E test with fake DeepSeek**

```ts
test('generates two candidates and accepts only the selected one', async ({ page }) => {
  await openChapter(page, projectId, chapterId);
  await page.getByRole('button', { name: '生成正文' }).click();
  await page.getByLabel('候选数量').selectOption('2');
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.getByRole('tab', { name: '候选 1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '候选 2' })).toBeVisible();
  await page.getByRole('tab', { name: '候选 2' }).click();
  await page.getByRole('button', { name: '采用此稿' }).click();
  await expect(page.getByText('已保存为正式稿')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toHaveValue(/候选二正文/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/novel-studio.spec.ts`

- [ ] **Step 3: Implement the chapter editor and draft journal**

Use CodeMirror for plain Markdown editing. Track server revision ID, dirty state, last acknowledged save, and IndexedDB recovery draft. A stale save opens a compare dialog instead of overwriting a newer server revision.

- [ ] **Step 4: Implement task toolbar and context preview**

Actions include generate, continue, rewrite selection, expand, condense, polish, dialogue, description, pacing, and viewpoint. Before start, preview prompt versions, world-book hits, context components, token budget, target, and candidate count.

- [ ] **Step 5: Implement candidate comparison and acceptance**

Show side-by-side or tabbed candidates, run status, incomplete marker, context manifest, and diff against the accepted chapter. Acceptance requires an explicit button and creates a revision.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix studio run test:e2e -- tests/e2e/novel-studio.spec.ts`

- [ ] **Step 7: Commit Task 5**

```powershell
git add -- studio/src/client/studio studio/tests/e2e/novel-studio.spec.ts studio/src/client/App.tsx
git commit -m "feat: deliver AI novel drafting workspace"
```

---

### Task 6: Deliver Character Theatre And Material Conversion

**Files:**
- Create: `studio/src/server/material/material-converter.ts`
- Create: `studio/src/server/material/material-routes.ts`
- Create: `studio/src/client/theatre/CharacterTheatre.tsx`
- Create: `studio/src/client/theatre/TheatreComposer.tsx`
- Create: `studio/src/client/theatre/BranchNavigator.tsx`
- Create: `studio/src/client/theatre/SessionStateInspector.tsx`
- Create: `studio/src/client/theatre/MaterialConversionDialog.tsx`
- Create: `studio/tests/server/material-converter.test.ts`
- Create: `studio/tests/e2e/character-theatre.spec.ts`
- Modify: `studio/src/server/app.ts`
- Modify: `studio/src/client/App.tsx`

**Interfaces:**
- Produces conversions `branch-to-scene-card`, `branch-to-chapter-candidate`, `message-to-example-dialogue`, `state-to-canon-proposal`, and `relationship-to-proposal`.
- Produces route `/projects/:projectId/theatre/:sessionId`.

- [ ] **Step 1: Write failing conversion tests**

```ts
it('converts only the selected active branch into a scene card', async () => {
  const result = await converter.convert({ projectId, sessionId, nodeId: 'a2', kind: 'branch-to-scene-card', title: '雨夜交锋' });
  expect(result.sceneCard.beats.map((beat) => beat.text).join('\n')).toContain('新回答');
  expect(result.sceneCard.beats.map((beat) => beat.text).join('\n')).not.toContain('原回答');
  expect((await canon.getBundle(projectId)).timeline).toHaveLength(0);
});
```

- [ ] **Step 2: Run unit and E2E tests to verify RED**

Run: `npm --prefix studio test -- tests/server/material-converter.test.ts && npm --prefix studio run test:e2e -- tests/e2e/character-theatre.spec.ts`

- [ ] **Step 3: Implement branch conversion without implicit canon mutation**

Conversion reads the active path ending at `nodeId`, validates all nodes belong to the session, and produces a scene card or chapter candidate. State and relationship conversion produces proposals only.

- [ ] **Step 4: Implement Character Theatre UI**

Provide participant selection, user persona, narrator mode, opening scene, OOC field, message editing, retry, two/three candidates, branch navigation, pinned memory, state inspector, context hits, stop, and material conversion.

- [ ] **Step 5: Verify GREEN**

The E2E test must create a session, receive a fake streamed reply, retry into a sibling branch, select a branch, reload, and convert it into a scene card while sibling history remains.

- [ ] **Step 6: Commit Task 6**

```powershell
git add -- studio/src/server/material studio/src/client/theatre studio/tests/server/material-converter.test.ts studio/tests/e2e/character-theatre.spec.ts studio/src/server/app.ts studio/src/client/App.tsx
git commit -m "feat: deliver branching character theatre"
```

---

### Task 7: Switch The Default Local App After Parity Verification

**Files:**
- Modify: root `package.json`
- Modify: root `README.md`
- Create: `studio/tests/e2e/workspace-parity.spec.ts`
- Create: `scripts/start-studio.js`

**Interfaces:**
- Produces root `npm start` launching the studio production server after build.
- Preserves `npm run legacy:start` for the secured legacy app during P3.

- [ ] **Step 1: Write a failing parity test**

The test must prove the studio can create/switch/rename/archive projects, save settings, import a legacy session, stream a chat-style theatre response, create a chapter, inspect context, and export project JSON.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/workspace-parity.spec.ts`

- [ ] **Step 3: Implement a production launcher**

`scripts/start-studio.js` checks for `studio/dist`, prints a clear build instruction when absent, loads studio config, and starts on `127.0.0.1:3000`. Root scripts become:

```json
{
  "start": "node scripts/start-studio.js",
  "legacy:start": "node server.js",
  "build": "npm run studio:build"
}
```

- [ ] **Step 4: Run the complete P2 gate**

Run: `npm run check && npm test && npm run studio:check && npm run studio:test && npm run studio:build && npm --prefix studio run test:e2e`

- [ ] **Step 5: Commit P2 completion**

```powershell
git add -- scripts/start-studio.js package.json package-lock.json README.md studio/tests/e2e/workspace-parity.spec.ts
git commit -m "feat: make dual-workspace studio the default"
```

## P2 Completion Gate

- Canon proposals remain separate until accepted.
- Outline hierarchy cannot contain missing, duplicate, or foreign children.
- Message edits and retries preserve sibling branches.
- Run deltas never follow mutable UI selection.
- Candidate prose does not overwrite accepted prose before adoption.
- Novel Studio supports planning, draft, continue, selected rewrites, candidate comparison, context preview, revision history, and recovery drafts.
- Character Theatre supports personas, narration modes, OOC, streaming, retries, branching, pinned memory, state proposals, and material conversion.
- Theatre conversion uses only the selected branch and never mutates canon implicitly.
- Real-server parity tests pass before the studio replaces the legacy default command.
