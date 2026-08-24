# Local AI Novel Studio Design

## 1. Goal

Transform the existing local DeepSeek chat page into a complete text-only AI novel creation studio with two connected workspaces:

1. **Novel Studio** for planning, drafting, revising, serializing, quality checking, and exporting long-form fiction.
2. **Character Theatre** for character roleplay, scene experimentation, branching conversations, and converting successful interactions into novel material.

The product must support both commercial web-serial writing and publication-oriented long-form revision. It remains a single-user local web application. Images, speech, payments, public communities, recommendation feeds, and cloud synchronization are out of scope.

The implementation may reproduce publicly documented workflow capabilities of AI writing and roleplay products, including character cards, world books, branching histories, long-term memory, novel mode, and configurable generation. It must not copy another product's brand, proprietary text, artwork, private APIs, or other protected assets.

## 2. Success Criteria

The project is successful when a user can:

- Create a novel project and retain it independently of browser cache.
- Move from premise to story bible, volume outline, chapter outline, scene cards, and final prose.
- Maintain reusable character cards, relationships, world-book entries, timeline events, and foreshadowing records.
- Generate, continue, rewrite, expand, condense, polish, and compare chapter candidates.
- Run serial-fiction and publication-quality reviews over chapters or the complete manuscript.
- Enter a character-driven roleplay session that uses the same project canon.
- Branch, retry, edit, and pin roleplay messages, then convert selected material into a scene card or chapter draft.
- Understand which context and world-book entries were sent for each generation.
- Recover from interrupted generation, browser refresh, storage failure, or accidental edits without silently losing accepted prose.
- Export a clean manuscript as Markdown, TXT, JSON, or DOCX.

Publication-mode chapters must reach a configurable quality threshold, defaulting to 88/100, and contain no unresolved fatal continuity defect before being marked as accepted. Serial-mode chapters default to 80/100.

## 3. Constraints

- Local-only, single-user application.
- Text generation only.
- DeepSeek is the only model provider required for the first release.
- The provider adapter must allow future model providers without changing domain modules.
- The server binds to `127.0.0.1` by default.
- Project data is stored in human-readable local Markdown and JSON files.
- Existing browser sessions must be offered a one-time migration path.
- Original accepted content is never silently truncated or overwritten.
- Adult or mature project labels configure prompts, metadata, and user boundaries but do not attempt to bypass provider safety controls.
- No generated manuscript is represented as legally compliant without human review. Platform-specific compliance checks are advisory.

## 4. Selected Technical Approach

Use a modular local web application:

- **Frontend:** React, TypeScript, Vite, React Router, TanStack Query for server state, and focused React context/reducers for editor state.
- **Backend:** Node.js 24, TypeScript, and Fastify with explicit static-file allowlisting, SSE routes, and structured errors.
- **Shared contracts:** Zod schemas and inferred TypeScript types shared between browser and server.
- **Persistent projects:** File-backed project repository with Markdown chapter files, JSON metadata, atomic replacement, and versioned backups.
- **Browser state:** IndexedDB only for transient UI state, drafts awaiting server persistence, migration staging, and offline recovery queues.
- **Rendering and export:** Marked plus DOMPurify for sanitized Markdown preview, and the `docx` package for local manuscript export.
- **Tests:** Vitest for unit and integration tests; Playwright for real-server desktop/mobile workflows and accessibility-critical behavior.

This replaces the current single embedded HTML/CSS/JavaScript file incrementally. The existing app remains available until migration and core workflow parity pass.

## 5. System Architecture

```text
React + TypeScript client
  Project Center
  Novel Studio
  Character Theatre
  Canon editors and quality reports
  Import, export, settings, and recovery
              |
              | local JSON HTTP + SSE
              v
Node + TypeScript local server
  Security boundary and route validation
  Project repository and backup manager
  DeepSeek provider adapter
  Prompt and context orchestrator
  Generation run coordinator
  Quality and continuity pipelines
              |
              v
data/projects/<project-id>/
  project.json
  characters.json
  relationships.json
  worldbook.json
  timeline.json
  foreshadowing.json
  outlines/*.json
  chapters/*.md
  scenes/*.json
  sessions/*.json
  runs/*.json
  quality-reports/*.json
  backups/
```

### 5.1 Module Boundaries

- **Project Repository:** Creates, reads, updates, lists, archives, snapshots, and restores projects. It does not call AI providers.
- **Prompt Registry:** Loads versioned prompt templates and project style profiles. It does not choose story context.
- **Context Orchestrator:** Selects canon, world-book entries, summaries, recent text, and task instructions within a token budget.
- **Provider Adapter:** Converts provider-neutral generation requests into DeepSeek requests and emits normalized stream events.
- **Generation Coordinator:** Owns run IDs, cancellation, recovery, candidate drafts, quality passes, and acceptance state.
- **Quality Pipeline:** Executes deterministic checks and model-assisted critique. It may propose patches but cannot overwrite accepted prose.
- **Import/Export Service:** Validates external data and produces portable project packages and manuscript formats.
- **Frontend Workspaces:** Consume server contracts and maintain presentation state. They do not implement persistence or prompt assembly.

## 6. Persistent Domain Model

### 6.1 Project

- ID, title, synopsis, genre, audience, target length, status, content rating, and prohibited elements.
- Writing mode: serial, publication, or both.
- Narrative defaults: point of view, tense, tone, style profile, chapter length, and language rules.
- Active model settings and quality thresholds.
- Created, updated, and last-backed-up timestamps.

### 6.2 Character

- Name, aliases, age, identity, appearance, background, goals, fears, secrets, values, abilities, limitations, and speech patterns.
- Current physical, emotional, relational, and knowledge state.
- Character arc milestones and immutable canon facts.
- Optional example dialogue and roleplay boundaries.

### 6.3 Relationship

- Directed relationship between two characters.
- Public relationship, private feelings, trust, conflict, leverage, shared secrets, and history.
- Time-stamped changes associated with chapters or roleplay scenes.

### 6.4 World Book Entry

- ID, name, category, aliases, content, trigger keywords, synonyms, and stage conditions.
- Scope: global, volume, chapter, character, or theatre session.
- Activation: constant, keyword-triggered, or plot-stage-triggered.
- Priority, insertion position, enabled state, and token limit.
- Source and last-confirmed location.
- AI-extracted entries remain proposals until user confirmation.

### 6.5 Outline Hierarchy

- Story bible containing premise, theme, core conflict, ending contract, setting, and style.
- Volumes containing goals, turning points, character changes, and unresolved hooks.
- Chapters containing purpose, viewpoint, location, time, conflict, reveal, emotional change, foreshadowing, payoff, and ending hook.
- Scene cards containing participants, entry state, beats, exit state, required canon, and prohibited outcomes.

### 6.6 Timeline and Foreshadowing

- Timeline events contain in-world time, duration, location, participants, dependencies, source chapter, and confidence.
- Foreshadowing records contain setup, intended payoff, status, deadline range, involved characters, and actual payoff location.
- Fatal conflicts block publication acceptance until resolved or explicitly waived.

### 6.7 Chapter and Revision

- The accepted chapter body is a Markdown file.
- Candidate drafts, review patches, and prior accepted versions are immutable revisions.
- Revision metadata records origin run, prompt version, context manifest, quality score, author action, and timestamp.

### 6.8 Theatre Session

- Participants, user persona, narrator configuration, scene, mode, world-book scope, and initial state.
- A message graph rather than a flat list, enabling edits, retries, and branches from any node.
- Pinned memories, relationship changes, and canon proposals are stored separately from raw messages.

### 6.9 Generation Run

- Unique run ID, task type, project, target, status, provider, model settings, context manifest, token estimates, stream checkpoints, candidates, review reports, errors, and timestamps.
- Status values: queued, planning, generating, reviewing, revising, completed, cancelled, failed, or interrupted.
- An interrupted run can resume or restart without altering the accepted document.

## 7. Novel Studio Workflows

### 7.1 Project Creation

The project wizard captures genre, audience, length, point of view, tone, content rating, prohibited elements, target platform, and whether the project emphasizes serial or publication standards. It supports blank projects, local templates, and validated project-package imports.

### 7.2 Planning

The user can generate or manually edit:

- Premise, theme, selling points, conflicts, reader promises, and ending contract.
- Story bible and world rules.
- Character cards, relationships, and arcs.
- Volume outline, chapter outline, and scene cards.
- Multiple alternative plans with comparison and merge controls.

Generated structural data must be parsed into typed records. Invalid AI output remains an inspectable candidate and is never applied silently.

### 7.3 Chapter Writing

Supported actions include:

- Generate from chapter outline and scene cards.
- Continue from the cursor or end of the accepted draft.
- Rewrite a selected range with an explicit goal.
- Expand, condense, polish, strengthen dialogue, strengthen description, change pacing, or change viewpoint.
- Generate two or three candidates, compare them, merge selected passages, and accept one revision.
- Freeze passages so subsequent full-chapter revision cannot alter them.

Every request shows an estimated context breakdown before generation and a final context manifest afterward.

### 7.4 Serial Mode

Serial review emphasizes opening strength, expectation management, escalation, information release, emotional payoff, chapter hooks, continuity of daily updates, and avoidance of repetitive filler. It also tracks promised hooks and unresolved reader expectations.

### 7.5 Publication Mode

Publication review emphasizes causality, thematic unity, character arcs, structural balance, viewpoint consistency, prose quality, dialogue distinction, timeline consistency, foreshadowing payoff, factual consistency, and manuscript formatting.

### 7.6 Dashboard

The dashboard shows manuscript word count, volume and chapter progress, revision status, character appearances, point-of-view distribution, unresolved foreshadowing, timeline conflicts, quality trends, and backup health.

## 8. Character Theatre Workflows

- Start from one or more project characters or local character templates.
- Configure the user persona, narrator, opening scene, first/third-person mode, dialogue/narrative balance, and OOC instructions.
- Edit a prior message, retry it, request multiple replies, or branch from any message.
- Pin an event or fact as session memory without immediately changing project canon.
- Track emotional state, relationship state, secrets learned, injuries, possessions, and active goals.
- Preview triggered world-book entries for each response.
- Convert a selected branch into a scene card, chapter candidate, character example dialogue, relationship update, or canon proposal.
- Create a theatre session from an existing chapter scene to test character reactions before rewriting the manuscript.

Project canon changes originating in theatre require explicit user confirmation.

## 9. Context and World-Book Orchestration

Context is assembled in this order:

1. Provider-neutral safety and language baseline.
2. Active task and mode instructions.
3. Project style profile and immutable canon.
4. Relevant character and relationship states.
5. Constant and triggered world-book entries.
6. Timeline and foreshadowing records relevant to the target.
7. Approved summaries of earlier material.
8. Directly relevant chapter excerpts or theatre messages.
9. Current user instruction and selected text.

The orchestrator reserves output tokens first, then fits input components into the remaining budget. It never merely reports an estimate while exceeding the configured budget.

Each component records its token estimate, priority, selection reason, and truncation status. When the budget is insufficient, lower-priority context is omitted as a complete unit where possible; accepted canon is not silently cut mid-fact.

Keyword triggering is required in the first release. The design permits future semantic retrieval, but embeddings and vector databases are not required.

## 10. Multi-Pass Generation and Quality Gate

### 10.1 Pipeline

```text
Task compiler
  -> chapter or scene planner
  -> context orchestration
  -> streaming candidate draft
  -> deterministic lint
  -> continuity review
  -> serial review
  -> publication review
  -> targeted patch proposal
  -> rescoring
  -> user acceptance
```

Planning and review outputs use typed JSON contracts. Prose generation streams text. Review passes cite exact passages and propose bounded changes. A revision pass edits identified ranges instead of regenerating the full chapter unless the user explicitly requests a full rewrite.

Automatic revision defaults to three passes and may be configured from one to five. The product does not run an unbounded provider loop. A run below threshold remains resumable with all candidates and reports preserved.

### 10.2 Quality Score

The score totals 100:

- Plot causality and logic: 15.
- Character consistency and development: 15.
- Prose, imagery, and natural language: 15.
- World, timeline, and factual consistency: 10.
- Narrative viewpoint stability: 10.
- Pacing and information release: 10.
- Dialogue distinction and subtext: 10.
- Serial appeal and chapter hook: 5.
- Originality and avoidance of obvious AI patterns: 5.
- Grammar, punctuation, and manuscript format: 5.

Serial acceptance defaults to 80. Publication acceptance defaults to 88. Scores do not override fatal defects. A fatal defect includes a direct contradiction of immutable canon, impossible timeline, missing causal dependency that invalidates the chapter, or unexplained character knowledge essential to the plot.

Users may accept a draft below threshold with an explicit waiver recorded in revision metadata.

## 11. Prompt System

Replace the single large default prompt with composable, versioned prompt modules:

- Language and formatting baseline.
- Serial-fiction mode.
- Publication mode.
- Planning, drafting, roleplay, continuity, critique, and revision tasks.
- Genre and style profiles.
- Project-specific author instructions.
- Content rating and prohibited elements.

The existing profile files are migrated into the registry after review. Prompt versions are recorded on every generation run so an old result can be reproduced or diagnosed.

## 12. Security and Local-Only Boundary

- Load and validate environment variables before deriving server constants.
- Bind to `127.0.0.1` unless the user explicitly configures another host.
- Serve only built frontend assets from an explicit directory allowlist.
- Return 404 for `.env`, `.git`, source files, tests, project data, backups, and arbitrary filesystem paths.
- Validate `Host`, `Origin`, request content type, body size, route parameters, and imported schemas.
- Sanitize rendered Markdown and disallow raw executable HTML.
- Apply a restrictive Content Security Policy and standard hardening headers.
- Bundle or pin browser dependencies rather than loading mutable scripts without integrity controls.
- Use path containment based on resolved path segments, not string-prefix checks.
- Propagate browser cancellation to upstream DeepSeek requests and enforce connect, idle, and total timeouts.
- Never log API keys, full prompts, manuscripts, roleplay content, or imported private data.
- Store structured operational logs with request ID, duration, status, token usage, and redacted error class.

## 13. Reliability, Backups, and Recovery

- All writes use a temporary file, flush, atomic rename, and schema validation.
- Accepted prose is immutable between named revisions.
- Automatic snapshots occur before destructive edits, project migrations, and bulk AI application.
- Backup retention is configurable by count and age; defaults preserve recent frequent snapshots plus daily checkpoints.
- Failed persistence leaves the prior valid file intact and presents a blocking recovery notice.
- The frontend keeps an unsaved draft journal in IndexedDB and clears it only after server acknowledgement.
- Stream checkpoints are saved without treating incomplete output as accepted prose.
- Import first validates and previews changes. Export never mutates the source project.

## 14. User Experience

### 14.1 Desktop

- Project navigation on the left, focused editor or theatre in the center, contextual inspector as a collapsible right drawer.
- Focus mode is the default writing layout.
- Advanced model parameters are hidden behind an advanced section.
- World-book hits, context budget, save state, run state, and quality status are visible but do not obscure prose.

### 14.2 Mobile

- A single full-width main column.
- Project/session navigation opens as a left drawer.
- Settings and context open as a bottom sheet or full-height drawer.
- No core action depends on hover.
- Editing, branching, generation cancellation, world-book inspection, and recovery remain available at 390 CSS pixels.

### 14.3 Accessibility

- Semantic headings, labels, landmarks, dialogs, and controls.
- Visible keyboard focus and keyboard-reachable message actions.
- Live regions for save, stream, error, and quality status.
- Minimum practical touch targets and responsive reflow.
- Reduced-motion support and no color-only state communication.

## 15. Import, Migration, and Export

### 15.1 Existing Data Migration

- Detect existing `deepseek_writer_*` IndexedDB and localStorage data.
- Preview session and settings counts before migration.
- Convert sessions into a dedicated imported project or theatre sessions.
- Preserve the original browser data until the user verifies the migrated project.
- Record migration version and errors per item.

### 15.2 Import

- Support validated project packages and legacy session JSON.
- Reject path-bearing, executable, oversized, malformed, or schema-incompatible fields.
- Imported assistant Markdown passes through the same rendering sanitizer.

### 15.3 Export

- Project package: complete versioned JSON/Markdown archive.
- Manuscript: Markdown, TXT, and DOCX with volumes, chapters, headings, and clean paragraph formatting.
- Diagnostic export: redacted run and quality metadata, excluding API keys and private operational configuration.

## 16. Error Handling

- Server errors use stable codes, user-safe Chinese messages, request IDs, and retryability metadata.
- Provider failures distinguish authentication, quota, rate limit, network, timeout, invalid request, safety refusal, malformed response, and interrupted stream.
- Cancelling a run is not displayed as an error.
- A failed quality pass preserves the candidate draft and allows retrying only that pass.
- Switching, deleting, archiving, or restoring a project with an active run requires cancellation or explicit background continuation.
- No stream callback locates its target through mutable active-session state; it writes only through its run and target IDs.

## 17. Testing Strategy

All feature and bug-fix work follows test-driven development.

### 17.1 Unit Tests

- Environment loading and validation.
- Path containment and static allowlists.
- Schema validation and migration.
- Atomic repository operations and backup retention.
- Context selection and strict token budgets.
- World-book triggers, priorities, scopes, and explanations.
- Message-graph branching.
- Quality scoring, fatal defects, thresholds, and waivers.
- SSE parsing, residual buffers, normalized stream events, cancellation, and retries.

### 17.2 Integration Tests

- Real local HTTP server with a fake DeepSeek upstream.
- Static-file leakage, hostile origins, request limits, timeouts, and security headers.
- Project CRUD, chapter revisions, recovery, import, export, and migration.
- Interrupted streams and process restart.
- Multi-pass generation with typed malformed and valid provider responses.

### 17.3 End-to-End Tests

- Create a project, plan a chapter, generate candidates, review, revise, accept, and export.
- Create a roleplay branch and convert it into a scene card.
- Trigger and inspect world-book entries.
- Restore a prior chapter revision.
- Migrate legacy sessions.
- Verify desktop and 390px mobile flows against the real server.
- Verify keyboard access, focus visibility, live status, and no hover-only actions.

### 17.4 Scale and Recovery Tests

- A synthetic project with 200–300 chapters and at least 1,000,000 Chinese characters.
- Many world-book entries and long theatre branches.
- Browser refresh during generation.
- Server termination between temporary write and atomic rename.
- Corrupt current metadata with a valid backup available.

## 18. P0–P3 Delivery Order

### P0: Security and Data Protection

- Static allowlist, loopback binding, secure paths, origin checks, security headers, Markdown sanitization, environment-order fix, upstream timeouts, and request cancellation.
- Remove all silent mutation or truncation of accepted messages and prose.
- Establish real-server security regression tests.

### P1: Reliable Project and Context Core

- Shared schemas, file-backed project repository, atomic writes, backups, chapter revisions, migration staging, prompt registry, strict token budget, world-book retrieval, and normalized DeepSeek streaming.

### P2: Dual Workspaces and AI Workflows

- Project center, Novel Studio, Character Theatre, outline hierarchy, character/relationship editors, world book, timeline, foreshadowing, message branches, material conversion, and multi-pass generation coordinator.

### P3: Publication Quality and Complete UX

- Serial/publication quality gates, targeted revision, manuscript dashboard, comparison and recovery UI, DOCX export, desktop focus mode, responsive mobile drawers, accessibility, and complete end-to-end coverage.

Every priority ends in a runnable, testable local application. Later phases must not postpone security or data-loss fixes required by earlier phases.

## 19. Acceptance Checklist

- Requests for `/.env`, `/.git/config`, server source, project data, and paths outside the frontend build return 404 or 403.
- The server listens only on the configured loopback address by default.
- Model or imported HTML cannot execute script in the application origin.
- No accepted chapter or message is silently truncated.
- A configured context budget is never exceeded by the assembled request estimate.
- Every generation provides a context manifest and writes only to its explicit run target.
- World-book activation is deterministic and inspectable for identical input.
- Active generation survives UI navigation and can be cancelled without corrupting another session.
- Interrupted writes preserve the prior valid project state.
- Legacy session migration is previewable, reversible, and non-destructive.
- Novel Studio and Character Theatre share confirmed canon while keeping proposals separate.
- Chapter candidates and roleplay branches can be compared and promoted without overwriting accepted content.
- Serial and publication quality reports cite passages, identify fatal defects, and preserve waivers.
- A 200–300 chapter, 1,000,000-character synthetic project remains usable, searchable, consistent, and recoverable.
- Every accepted chapter produces a durable post-chapter state snapshot covering character state, relationship deltas, timeline events, revealed knowledge, active goals, unresolved hooks, and foreshadowing changes.
- Cross-volume fact lookup can trace a setting or state to its confirming chapter and revision instead of relying on lossy conversational summaries.
- All core workflows function at desktop and 390px mobile widths.
- The full automated test suite, type checking, production build, dependency audit, and security regressions pass with no unexplained warnings.

## 20. Public Benchmark Context

The capability benchmark was derived from publicly documented product descriptions available on 2026-08-24, including AI Fengyue's public features and creation guide. These sources describe character customization, world-book keyword triggering, configurable response behavior, conversation history, branching novel interaction, templates, and story modes. They are used only to identify generic product capabilities.

- https://aifengyue.cc/features.html
- https://aifengyue.cc/guide.html
