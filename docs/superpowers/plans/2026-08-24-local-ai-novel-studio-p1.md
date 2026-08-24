# Local AI Novel Studio P1 Reliable Project And Context Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the modular TypeScript studio foundation with durable local projects, atomic backups, strict context budgets, inspectable world-book retrieval, legacy migration, and normalized DeepSeek streaming.

**Architecture:** Add a self-contained `studio/` application while the secured legacy page remains runnable. The studio shares Zod contracts between React and Fastify, stores accepted project content in Markdown/JSON files through an atomic repository, and treats every model operation as an explicit generation run.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Zod, React, Vite, React Router, TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-local-ai-novel-studio-design.md`

## Global Constraints

- Local-only and single-user; studio server defaults to `127.0.0.1:3100` during migration.
- The secured legacy server remains available until P2 parity is proven.
- Accepted chapters are Markdown; structured canon is validated JSON.
- Writes are atomic and backups precede destructive changes.
- IndexedDB is not the source of truth for accepted studio manuscripts.
- Context assembly reserves output tokens and must not exceed its configured input budget.
- AI-extracted canon remains a proposal until user confirmation.
- DeepSeek is the only required provider, behind a provider-neutral interface.

---

## File Map

- `studio/package.json`, `studio/tsconfig*.json`, `studio/vite.config.ts`: isolated studio toolchain.
- `studio/src/shared/contracts/*.ts`: Zod contracts and inferred types.
- `studio/src/server/config.ts`: validated studio runtime configuration.
- `studio/src/server/app.ts`: Fastify composition root.
- `studio/src/server/projects/project-repository.ts`: atomic project persistence and revisions.
- `studio/src/server/projects/backup-manager.ts`: snapshot and retention behavior.
- `studio/src/server/projects/project-routes.ts`: validated project APIs.
- `studio/src/server/migration/legacy-migration.ts`: legacy browser export conversion.
- `studio/src/server/prompts/prompt-registry.ts`: versioned prompt modules.
- `studio/src/server/context/context-orchestrator.ts`: strict token budget and manifest.
- `studio/src/server/context/worldbook-retriever.ts`: deterministic trigger selection.
- `studio/src/server/providers/provider.ts`: provider-neutral stream contract.
- `studio/src/server/providers/deepseek-provider.ts`: DeepSeek adapter.
- `studio/src/server/generation/run-store.ts`: persistent generation-run state.
- `studio/src/client/*`: initial project-center shell and API client.

---

### Task 1: Scaffold A Typed Studio That Boots Through A Real Server

**Files:**
- Create: `studio/package.json`
- Create: `studio/tsconfig.json`
- Create: `studio/tsconfig.server.json`
- Create: `studio/vite.config.ts`
- Create: `studio/index.html`
- Create: `studio/src/client/main.tsx`
- Create: `studio/src/client/App.tsx`
- Create: `studio/src/server/app.ts`
- Create: `studio/src/server/index.ts`
- Create: `studio/tests/server/health.test.ts`
- Modify: root `package.json`

**Interfaces:**
- Produces: `buildApp(options?: AppOptions): Promise<FastifyInstance>`.
- Produces: `GET /api/health -> { ok: true, version: 1 }`.
- Produces root scripts `studio:dev`, `studio:build`, `studio:test`, and `studio:check`.

- [ ] **Step 1: Write the failing health test**

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';

describe('studio server', () => {
  it('returns a versioned health contract', async () => {
    const app = await buildApp({ logger: false });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, version: 1 });
    await app.close();
  });
});
```

- [ ] **Step 2: Install the studio toolchain and verify RED**

Create `studio/package.json` with exact dependencies used by the spec, run `npm --prefix studio install`, then run:

`npm --prefix studio test -- tests/server/health.test.ts`

Expected: FAIL because `src/server/app.ts` is missing.

- [ ] **Step 3: Implement the minimal Fastify app and React shell**

```ts
import Fastify, { type FastifyInstance } from 'fastify';

export interface AppOptions { logger?: boolean }

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.get('/api/health', async () => ({ ok: true as const, version: 1 as const }));
  await app.ready();
  return app;
}
```

The React shell must render `本地 AI 小说工作台` and three disabled navigation labels: `项目中心`, `小说工坊`, and `角色剧场`. Only Project Center becomes active in P1.

- [ ] **Step 4: Add root forwarding scripts without replacing the legacy start command**

```json
{
  "studio:dev": "npm --prefix studio run dev",
  "studio:build": "npm --prefix studio run build",
  "studio:test": "npm --prefix studio test",
  "studio:check": "npm --prefix studio run check"
}
```

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/health.test.ts && npm run studio:check && npm run studio:build`

Expected: test, TypeScript checks, and production build pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- studio package.json package-lock.json
git commit -m "feat: scaffold typed local novel studio"
```

---

### Task 2: Define Shared Project And Canon Contracts

**Files:**
- Create: `studio/src/shared/contracts/project.ts`
- Create: `studio/src/shared/contracts/canon.ts`
- Create: `studio/src/shared/contracts/outline.ts`
- Create: `studio/src/shared/contracts/generation.ts`
- Create: `studio/src/shared/contracts/index.ts`
- Create: `studio/tests/shared/contracts.test.ts`

**Interfaces:**
- Produces: `ProjectSchema`, `CharacterSchema`, `RelationshipSchema`, `WorldBookEntrySchema`, `TimelineEventSchema`, `ForeshadowingSchema`, `OutlineSchema`, `ChapterMetaSchema`, `GenerationRunSchema`, and inferred types.
- Consumed by: every P1 repository, route, migration, context, and run module.

- [ ] **Step 1: Write failing schema tests using real invalid data**

```ts
import { describe, expect, it } from 'vitest';
import { ProjectSchema, WorldBookEntrySchema, GenerationRunSchema } from '../../src/shared/contracts';

describe('shared contracts', () => {
  it('rejects unsafe project IDs and impossible thresholds', () => {
    expect(ProjectSchema.safeParse({ id: '../escape', quality: { serial: 120, publication: 88 } }).success).toBe(false);
  });

  it('requires inspectable activation rules for world-book entries', () => {
    expect(WorldBookEntrySchema.safeParse({ id: 'w1', name: '王都', activation: 'keyword', keywords: [] }).success).toBe(false);
  });

  it('keeps interrupted generation runs resumable', () => {
    const result = GenerationRunSchema.safeParse({
      id: 'run_01', projectId: 'project_01', task: 'chapter-draft', status: 'interrupted',
      target: { kind: 'chapter', id: 'chapter_01' }, candidates: [], createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/shared/contracts.test.ts`

Expected: FAIL because the shared contract index does not exist.

- [ ] **Step 3: Implement explicit discriminated schemas**

Use IDs matching `/^[a-z][a-z0-9_-]{2,63}$/`, ISO timestamps, quality thresholds `0..100`, content ratings `general|teen|mature|adult`, writing modes `serial|publication|both`, and generation statuses from the approved spec. Define world-book activation as:

```ts
const KeywordActivationSchema = z.object({
  type: z.literal('keyword'),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(64),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(128).default([]),
});

const ConstantActivationSchema = z.object({ type: z.literal('constant') });
const StageActivationSchema = z.object({
  type: z.literal('stage'),
  stages: z.array(z.string().trim().min(1).max(80)).min(1).max(32),
});
```

All JSON files include `schemaVersion: 1`.

- [ ] **Step 4: Verify GREEN and exported type consistency**

Run: `npm --prefix studio test -- tests/shared/contracts.test.ts && npm run studio:check`

Expected: contracts reject unsafe data and all inferred types compile.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- studio/src/shared/contracts studio/tests/shared/contracts.test.ts
git commit -m "feat: define novel project contracts"
```

---

### Task 3: Implement Atomic Projects, Chapter Revisions, And Backups

**Files:**
- Create: `studio/src/server/projects/atomic-file.ts`
- Create: `studio/src/server/projects/project-paths.ts`
- Create: `studio/src/server/projects/backup-manager.ts`
- Create: `studio/src/server/projects/project-repository.ts`
- Create: `studio/tests/server/project-repository.test.ts`

**Interfaces:**
- Produces: `createProjectRepository({ dataRoot, clock, idFactory })`.
- Produces methods `createProject`, `listProjects`, `getProject`, `saveCanon`, `readChapter`, `saveChapterRevision`, `listChapterRevisions`, and `restoreChapterRevision`.
- Produces `atomicWriteText(file, content)` and `resolveProjectPath(dataRoot, projectId, ...segments)`.

- [ ] **Step 1: Write failing repository behavior tests**

```ts
it('preserves the accepted chapter and creates a revision before replacement', async () => {
  const repo = createTestRepository(tempDir);
  const project = await repo.createProject(validProjectInput('长夜'));
  await repo.saveChapterRevision(project.id, 'chapter_001', '# 第一章\n\n旧正文', { reason: 'initial' });
  await repo.saveChapterRevision(project.id, 'chapter_001', '# 第一章\n\n新正文', { reason: 'accepted-candidate' });
  expect(await repo.readChapter(project.id, 'chapter_001')).toContain('新正文');
  const revisions = await repo.listChapterRevisions(project.id, 'chapter_001');
  expect(revisions).toHaveLength(2);
  await repo.restoreChapterRevision(project.id, 'chapter_001', revisions[0].id);
  expect(await repo.readChapter(project.id, 'chapter_001')).toContain('旧正文');
});

it('never resolves a project path outside dataRoot', () => {
  expect(() => resolveProjectPath(tempDir, '../escape', 'project.json')).toThrow(/非法项目路径/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/project-repository.test.ts`

Expected: FAIL with missing repository module.

- [ ] **Step 3: Implement atomic file replacement and segment-based containment**

```ts
export async function atomicWriteText(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

export function resolveProjectPath(root: string, projectId: string, ...segments: string[]): string {
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(projectId)) throw new Error('非法项目路径');
  if (segments.some((segment) => segment.includes('..') || /[\\/]/.test(segment))) throw new Error('非法项目路径');
  return resolve(root, 'projects', projectId, ...segments);
}
```

Before replacing an accepted chapter or JSON canon file, write an immutable revision record and content copy under `backups/` or `chapters/.revisions/`.

- [ ] **Step 4: Implement default backup retention**

Retain the newest 20 operation snapshots, one newest daily snapshot for 30 days, and one newest monthly snapshot for 12 months. Deletion is limited to validated backup directories and occurs only after the new snapshot is complete.

- [ ] **Step 5: Verify GREEN including simulated failed rename**

Inject file operations in the repository test, force `rename` to fail, and assert that the old accepted file remains byte-for-byte unchanged and the temporary file is reported for recovery.

Run: `npm --prefix studio test -- tests/server/project-repository.test.ts`

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- studio/src/server/projects studio/tests/server/project-repository.test.ts
git commit -m "feat: persist projects with atomic revisions"
```

---

### Task 4: Expose Validated Project APIs And Legacy Migration

**Files:**
- Create: `studio/src/server/projects/project-routes.ts`
- Create: `studio/src/server/migration/legacy-migration.ts`
- Create: `studio/src/shared/contracts/migration.ts`
- Create: `studio/tests/server/project-routes.test.ts`
- Create: `studio/tests/server/legacy-migration.test.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces routes `GET/POST /api/projects`, `GET /api/projects/:id`, `PUT /api/projects/:id/canon/:kind`, `GET/PUT /api/projects/:id/chapters/:chapterId`.
- Produces `POST /api/migrations/legacy/preview` and `POST /api/migrations/legacy/apply`.
- Produces `previewLegacyMigration(payload)` and `applyLegacyMigration(payload, repository)`.

- [ ] **Step 1: Write failing route and non-destructive migration tests**

```ts
it('rejects an invalid project before touching disk', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { id: '../x', title: '' } });
  expect(response.statusCode).toBe(400);
  expect(await directoryIsEmpty(dataRoot)).toBe(true);
});

it('previews legacy sessions without applying them', async () => {
  const payload = { settings: { temperature: 0.7 }, sessions: [{ id: 'old1', title: '旧会话', messages: [{ role: 'user', content: '开篇' }] }] };
  const preview = previewLegacyMigration(payload);
  expect(preview.sessions).toEqual([{ sourceId: 'old1', title: '旧会话', messageCount: 1, valid: true }]);
  expect(await directoryIsEmpty(dataRoot)).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/project-routes.test.ts tests/server/legacy-migration.test.ts`

Expected: FAIL with missing route and migration modules.

- [ ] **Step 3: Implement a consistent API error contract**

All validation errors return:

```ts
interface ApiErrorBody {
  error: { code: string; message: string; requestId: string; retryable: boolean; fields?: Record<string, string> };
}
```

Parse every path parameter and body through shared Zod schemas before repository access.

- [ ] **Step 4: Implement preview/apply separation**

`previewLegacyMigration` returns counts, titles, message counts, invalid items, estimated disk usage, and settings mapping. `applyLegacyMigration` requires the preview fingerprint and creates an `imported-legacy-<date>` project plus theatre sessions. It never deletes localStorage or IndexedDB data.

- [ ] **Step 5: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/project-routes.test.ts tests/server/legacy-migration.test.ts`

Expected: invalid input leaves disk untouched; preview leaves disk untouched; apply creates validated files.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- studio/src/server/projects/project-routes.ts studio/src/server/migration studio/src/shared/contracts/migration.ts studio/tests/server/project-routes.test.ts studio/tests/server/legacy-migration.test.ts studio/src/server/app.ts
git commit -m "feat: add project APIs and legacy migration"
```

---

### Task 5: Build Strict Context Budgets And Explainable World-Book Retrieval

**Files:**
- Create: `studio/src/server/context/token-estimator.ts`
- Create: `studio/src/server/context/worldbook-retriever.ts`
- Create: `studio/src/server/context/context-orchestrator.ts`
- Create: `studio/src/shared/contracts/context.ts`
- Create: `studio/tests/server/context-orchestrator.test.ts`

**Interfaces:**
- Produces: `estimateTokens(text): number`.
- Produces: `retrieveWorldBook({ entries, text, scope, stage }): WorldBookHit[]`.
- Produces: `assembleContext(input): { messages, manifest, inputTokens, reservedOutputTokens }`.
- Manifest entries contain `sourceId`, `kind`, `reason`, `priority`, `estimatedTokens`, and `status`.

- [ ] **Step 1: Write failing deterministic retrieval and hard-budget tests**

```ts
it('selects identical world-book hits for identical input', () => {
  const first = retrieveWorldBook(fixture);
  const second = retrieveWorldBook(fixture);
  expect(second).toEqual(first);
  expect(first.map((hit) => hit.entry.id)).toEqual(['royal_city', 'hero_secret']);
});

it('never exceeds the input budget after reserving output', () => {
  const result = assembleContext({ ...largeFixture, contextWindow: 20_000, requestedOutputTokens: 4_000 });
  expect(result.inputTokens).toBeLessThanOrEqual(16_000);
  expect(result.manifest.some((entry) => entry.status === 'omitted-budget')).toBe(true);
  expect(result.messages.at(-1)?.role).toBe('user');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/context-orchestrator.test.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement normalized keyword triggering and stable ordering**

Normalize full-width ASCII, Unicode case, surrounding punctuation, and whitespace. A keyword entry matches when any normalized keyword or synonym is contained in normalized input. Sort hits by descending priority, then scope specificity, then ID. Return the matched term and reason.

- [ ] **Step 4: Implement component-level budget packing**

```ts
const availableInput = contextWindow - requestedOutputTokens;
for (const component of components.sort(compareContextPriority)) {
  const tokens = estimateTokens(component.content);
  if (used + tokens > availableInput) {
    manifest.push({ ...component.meta, estimatedTokens: tokens, status: 'omitted-budget' });
    continue;
  }
  selected.push(component);
  used += tokens;
  manifest.push({ ...component.meta, estimatedTokens: tokens, status: 'included' });
}
```

Immutable canon and the current user task are mandatory. If mandatory components alone exceed the budget, return a typed `CONTEXT_BUDGET_IMPOSSIBLE` error rather than truncating facts mid-entry.

- [ ] **Step 5: Verify GREEN and property boundaries**

Add generated fixtures across budgets `4_000..200_000` and assert `inputTokens + reservedOutputTokens <= contextWindow` for every successful result.

Run: `npm --prefix studio test -- tests/server/context-orchestrator.test.ts`

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- studio/src/server/context studio/src/shared/contracts/context.ts studio/tests/server/context-orchestrator.test.ts
git commit -m "feat: assemble explainable bounded context"
```

---

### Task 6: Add Versioned Prompt Registry And Normalized DeepSeek Streaming

**Files:**
- Create: `studio/src/server/prompts/prompt-registry.ts`
- Create: `studio/src/server/prompts/modules/*.md`
- Create: `studio/src/server/providers/provider.ts`
- Create: `studio/src/server/providers/deepseek-provider.ts`
- Create: `studio/src/server/generation/run-store.ts`
- Create: `studio/src/server/generation/generation-routes.ts`
- Create: `studio/tests/server/prompt-registry.test.ts`
- Create: `studio/tests/server/deepseek-provider.test.ts`
- Modify: `studio/src/server/app.ts`

**Interfaces:**
- Produces: `PromptRegistry.get(moduleId, version)` and `PromptRegistry.compose(selection)`.
- Produces provider events `reasoning-delta`, `content-delta`, `usage`, `finish`, and `error`.
- Produces `POST /api/projects/:id/runs` and `GET /api/runs/:runId/events` as SSE.
- Produces `RunStore.create`, `appendCheckpoint`, `complete`, `interrupt`, and `get`.

- [ ] **Step 1: Write failing prompt-version and residual-SSE tests**

```ts
it('records the exact prompt module versions', () => {
  const composed = registry.compose([{ id: 'language-baseline', version: 1 }, { id: 'chapter-draft', version: 1 }]);
  expect(composed.manifest).toEqual([
    { id: 'language-baseline', version: 1 },
    { id: 'chapter-draft', version: 1 },
  ]);
});

it('emits the last SSE event without a trailing newline', async () => {
  const response = fakeResponse('data: {"choices":[{"delta":{"content":"结尾"}}]}');
  const events = await collect(provider.stream(validRequest, { fetchImpl: async () => response }));
  expect(events).toContainEqual({ type: 'content-delta', text: '结尾' });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio test -- tests/server/prompt-registry.test.ts tests/server/deepseek-provider.test.ts`

Expected: FAIL because registry and provider do not exist.

- [ ] **Step 3: Implement exact prompt manifests**

Each prompt module begins with machine-readable front matter containing `id`, integer `version`, `task`, and compatible modes. Composition returns text plus the manifest and rejects unknown versions.

- [ ] **Step 4: Implement provider-neutral streaming**

Parse SSE by event boundaries, carry decoder state across chunks, process the final residual buffer, expose `reasoning_content` separately from final `content`, normalize `finish_reason`, enforce timeout, and accept an external `AbortSignal`. Provider errors must not include request prompts or API keys.

- [ ] **Step 5: Persist checkpoints by run ID**

Every run writes to `runs/<runId>.json`; a route stream appends candidate deltas to a temporary run artifact. A browser disconnect marks the run `interrupted` unless the user explicitly configured background continuation.

- [ ] **Step 6: Verify GREEN**

Run: `npm --prefix studio test -- tests/server/prompt-registry.test.ts tests/server/deepseek-provider.test.ts && npm run studio:test`

Expected: prompt versions are reproducible, all stream fragmentation fixtures normalize identically, and interrupted runs remain readable.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- studio/src/server/prompts studio/src/server/providers studio/src/server/generation studio/tests/server/prompt-registry.test.ts studio/tests/server/deepseek-provider.test.ts studio/src/server/app.ts
git commit -m "feat: add versioned prompts and DeepSeek runs"
```

---

### Task 7: Deliver The P1 Project Center And Core Gate

**Files:**
- Create: `studio/src/client/api/client.ts`
- Create: `studio/src/client/projects/ProjectCenter.tsx`
- Create: `studio/src/client/projects/CreateProjectDialog.tsx`
- Create: `studio/src/client/migration/LegacyMigrationDialog.tsx`
- Create: `studio/tests/e2e/project-center.spec.ts`
- Modify: `studio/src/client/App.tsx`
- Modify: `studio/package.json`
- Modify: root `README.md`

**Interfaces:**
- Consumes project and migration APIs from Task 4.
- Produces a runnable Project Center that creates, opens, lists, archives, and previews migration.
- Produces stable P1 commands `npm run studio:test`, `npm run studio:check`, `npm run studio:build`, and `npm --prefix studio run test:e2e`.

- [ ] **Step 1: Write a failing real-server Project Center E2E test**

```ts
test('creates a durable local project and survives reload', async ({ page }) => {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '新建小说' }).click();
  await page.getByLabel('作品名称').fill('长夜回声');
  await page.getByLabel('写作模式').selectOption('both');
  await page.getByRole('button', { name: '创建项目' }).click();
  await expect(page.getByRole('heading', { name: '长夜回声' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '长夜回声' })).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix studio run test:e2e -- tests/e2e/project-center.spec.ts`

Expected: FAIL because Project Center controls are absent.

- [ ] **Step 3: Implement Project Center with server-state queries**

Use TanStack Query keys `['projects']` and `['project', projectId]`. Mutations invalidate exact keys. Dialog submission displays field-level API errors and remains open on failure. The UI never treats localStorage as project persistence.

- [ ] **Step 4: Implement migration preview UI**

Read legacy browser data only after the user clicks `检测旧版数据`. Show counts and invalid items, then require a separate `开始迁移` action. Do not clear original data.

- [ ] **Step 5: Run the complete P1 gate**

Run: `npm run studio:check && npm run studio:test && npm run studio:build && npm --prefix studio run test:e2e`

Expected: all commands pass and the created project exists under the configured test data directory after reload.

- [ ] **Step 6: Commit P1 completion**

```powershell
git add -- studio/src/client studio/tests/e2e studio/package.json studio/package-lock.json README.md
git commit -m "feat: deliver reliable local project center"
```

## P1 Completion Gate

- Typed contracts reject malformed projects, canon, runs, and migrations.
- Atomic-write failure leaves accepted files unchanged.
- Chapter revisions can be listed and restored.
- Migration preview and apply are separate and original browser data remains intact.
- Identical world-book input produces identical explained hits.
- Successful context assembly never exceeds its budget.
- Prompt versions and context manifests are recorded on generation runs.
- Fragmented, residual, reasoning, content, usage, finish, timeout, and cancellation stream cases pass.
- A project created in the React Project Center survives reload from disk.
- Legacy P0 and studio P1 test suites both pass.

