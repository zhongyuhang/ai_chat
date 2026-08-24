export interface Project {
  id: string;
  title: string;
  synopsis: string;
  writingMode: 'serial' | 'publication' | 'both';
  targetCharacters: number;
  status: 'draft' | 'active' | 'archived' | 'completed';
  contentRating: 'general' | 'teen' | 'mature' | 'adult';
  updatedAt: string;
}

export interface ChapterRevision {
  schemaVersion: 1;
  id: string;
  chapterId: string;
  reason: string;
  characterCount: number;
  createdAt: string;
}

export type WritingTaskKind = 'chapter-draft' | 'continue' | 'rewrite-selection' | 'expand-selection' | 'condense-selection' | 'polish-selection' | 'theatre-reply';
export interface GenerationTaskInput {
  kind: WritingTaskKind;
  target: { kind: 'chapter' | 'theatre-session'; id: string };
  instruction: string;
  candidateCount: number;
  model?: string;
  requestedOutputTokens: number;
  contextWindow: number;
  sourceRevisionId?: string;
}
export interface ContextPreview {
  inputTokens: number;
  reservedOutputTokens: number;
  candidateCount: number;
  promptManifest: Array<{ id: string; version: number }>;
  manifest: Array<{ sourceId: string; kind: string; reason: string; priority: number; estimatedTokens: number; status: 'included' | 'omitted-budget' | 'missing' }>;
}
export interface GenerationRunDetail {
  id: string;
  status: 'queued' | 'generating' | 'completed' | 'failed' | 'interrupted' | 'cancelled';
  error?: { code: string; message: string; retryable: boolean };
  contextManifest: ContextPreview['manifest'];
  candidates: Array<{ id: string; content: string; accepted: boolean }>;
}
export interface TheatreMessageNode {
  id: string;
  parentId: string | null;
  children: string[];
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  runId?: string;
}
export interface TheatreSession {
  id: string;
  projectId: string;
  title: string;
  participantIds: string[];
  userPersona: string;
  narratorMode: 'none' | 'light' | 'cinematic' | 'omniscient';
  pinnedMemory: string[];
  state: Record<string, unknown>;
  graph: { rootId: string; activeLeafId: string; nodes: Record<string, TheatreMessageNode>; selectedChildren: Record<string, string> };
  updatedAt: string;
}
export interface QualityIssue {
  id: string;
  code: string;
  revisionId: string;
  category: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  start: number;
  end: number;
  excerpt: string;
  message: string;
}
export interface QualityReport {
  id: string;
  chapterId: string;
  revisionId: string;
  mode: 'serial' | 'publication';
  total: number;
  threshold: number;
  categoryScores: Record<string, number>;
  weightedScores: Record<string, number>;
  issues: QualityIssue[];
  fatalDefects: Array<{ code: string; message: string }>;
  waiver?: { author: string; note: string; createdAt: string };
  createdAt: string;
}

interface ApiFailure {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

export class ApiError extends Error {
  fields: Record<string, string>;
  code: string;

  constructor(response: ApiFailure, status: number) {
    super(response.error?.message || `请求失败：HTTP ${status}`);
    this.code = response.error?.code || 'API_ERROR';
    this.fields = response.error?.fields || {};
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data, response.status);
  return data as T;
}

export const api = {
  async listProjects(): Promise<Project[]> {
    return (await request<{ projects: Project[] }>('/api/projects')).projects;
  },
  createProject(input: { title: string; writingMode: Project['writingMode']; targetCharacters: number }) {
    return request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });
  },
  archiveProject(id: string) {
    return request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
  },
  previewLegacy(payload: unknown) {
    return request<{ fingerprint: string; validSessions: number; invalidSessions: number; estimatedBytes: number; sessions: unknown[] }>(
      '/api/migrations/legacy/preview',
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },
  applyLegacy(payload: unknown, fingerprint: string) {
    return request<{ project: Project; importedSessions: number }>('/api/migrations/legacy/apply', {
      method: 'POST',
      body: JSON.stringify({ payload, fingerprint }),
    });
  },
  getCanon(projectId: string) {
    return request<{
      characters: Array<{ id: string; name: string; goals: string[]; speechPatterns: string[]; currentState: { physical: string; emotional: string; relational: string; knowledge: string } }>;
      relationships: Array<{ id: string; fromCharacterId: string; toCharacterId: string; publicRelationship: string; privateFeelings: string; conflict: string; trust: number }>;
      worldBook: Array<{ id: string; name: string; content: string }>;
      timeline: Array<{ id: string; title: string; inWorldTime: string }>;
      foreshadowing: Array<{ id: string; setup: string; intendedPayoff: string; status: string }>;
    }>(`/api/projects/${projectId}/canon`);
  },
  saveCharacter(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/canon/characters/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveWorldBook(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/canon/worldbook/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveRelationship(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/canon/relationships/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveTimelineEvent(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/canon/timeline/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveForeshadowing(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/canon/foreshadowing/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  getOutline(projectId: string) {
    return request<{ schemaVersion: 1; premise: string; themes: string[]; coreConflict: string; endingContract: string; setting: string; style: string; updatedAt: string; volumes: Array<{ id: string; title: string; goal: string; chapters: Array<{ id: string; title: string; purpose: string; endingHook: string; scenes: unknown[] }> }> }>(`/api/projects/${projectId}/outline`);
  },
  saveStoryBible(projectId: string, value: unknown) {
    return request(`/api/projects/${projectId}/outline/story-bible`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveVolume(projectId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/outline/volumes/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  saveChapterOutline(projectId: string, volumeId: string, id: string, value: unknown) {
    return request(`/api/projects/${projectId}/outline/volumes/${volumeId}/chapters/${id}`, { method: 'PUT', body: JSON.stringify(value) });
  },
  previewWorldBook(projectId: string, text: string) {
    return request<{ hits: Array<{ matchedTerm?: string; reason: string; entry: { id: string; name: string } }> }>(`/api/projects/${projectId}/canon/worldbook/preview`, { method: 'POST', body: JSON.stringify({ text }) });
  },
  async getChapter(projectId: string, chapterId: string) {
    try {
      return await request<{ content: string; revision?: ChapterRevision }>(`/api/projects/${projectId}/chapters/${chapterId}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') return { content: '' };
      throw error;
    }
  },
  saveChapter(projectId: string, chapterId: string, content: string, reason = 'manual-save', baseRevisionId?: string) {
    return request<{ ok: true; revision: ChapterRevision }>(`/api/projects/${projectId}/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify({ content, reason, baseRevisionId }),
    });
  },
  async listChapterRevisions(projectId: string, chapterId: string) {
    return (await request<{ revisions: ChapterRevision[] }>(`/api/projects/${projectId}/chapters/${chapterId}/revisions`)).revisions;
  },
  restoreChapterRevision(projectId: string, chapterId: string, revisionId: string) {
    return request<{ ok: true; revision: ChapterRevision }>(`/api/projects/${projectId}/chapters/${chapterId}/revisions/${revisionId}/restore`, { method: 'POST' });
  },
  previewGeneration(projectId: string, task: GenerationTaskInput) {
    return request<ContextPreview>(`/api/projects/${projectId}/generation/preview`, { method: 'POST', body: JSON.stringify(task) });
  },
  startGeneration(projectId: string, task: GenerationTaskInput) {
    return request<{ id: string }>(`/api/projects/${projectId}/generation/tasks`, { method: 'POST', body: JSON.stringify(task) });
  },
  getGenerationRun(runId: string) {
    return request<GenerationRunDetail>(`/api/runs/${runId}/detail`);
  },
  cancelGeneration(runId: string) {
    return request<GenerationRunDetail>(`/api/runs/${runId}/cancel`, { method: 'POST' });
  },
  acceptGenerationCandidate(runId: string, candidateId: string) {
    return request(`/api/runs/${runId}/candidates/${candidateId}/accept`, { method: 'POST' });
  },
  async listTheatreSessions(projectId: string) {
    return (await request<{ sessions: TheatreSession[] }>(`/api/projects/${projectId}/theatre`)).sessions;
  },
  getTheatreSession(projectId: string, sessionId: string) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre/${sessionId}`);
  },
  createTheatreSession(projectId: string, input: { title: string; participantIds: string[]; opening: { role: 'system'; content: string }; userPersona: string; narratorMode: TheatreSession['narratorMode'] }) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre`, { method: 'POST', body: JSON.stringify(input) });
  },
  appendTheatreMessage(projectId: string, sessionId: string, parentId: string, input: { role: 'user'; content: string }) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre/${sessionId}/nodes/${parentId}/append`, { method: 'POST', body: JSON.stringify(input) });
  },
  selectTheatreBranch(projectId: string, sessionId: string, parentId: string, childId: string) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre/${sessionId}/nodes/${parentId}/select`, { method: 'POST', body: JSON.stringify({ childId }) });
  },
  pinTheatreMemory(projectId: string, sessionId: string, memory: string) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre/${sessionId}/pinned-memory`, { method: 'POST', body: JSON.stringify({ memory }) });
  },
  acceptTheatreCandidate(projectId: string, sessionId: string, runId: string, candidateId: string, parentId: string) {
    return request<TheatreSession>(`/api/projects/${projectId}/theatre/${sessionId}/runs/${runId}/candidates/${candidateId}/accept`, { method: 'POST', body: JSON.stringify({ parentId }) });
  },
  convertTheatreBranch(projectId: string, sessionId: string, nodeId: string, title: string) {
    return request<{ sceneCard: { id: string; title: string; beats: string[] } }>(`/api/projects/${projectId}/theatre/${sessionId}/materials`, { method: 'POST', body: JSON.stringify({ nodeId, title, kind: 'branch-to-scene-card' }) });
  },
  async listQualityReports(projectId: string) {
    return (await request<{ reports: QualityReport[] }>(`/api/projects/${projectId}/quality`)).reports;
  },
  reviewChapter(projectId: string, chapterId: string, mode: 'serial' | 'publication') {
    return request<{ report: QualityReport; decision: { allowed: boolean; reason?: string; threshold: number } }>(`/api/projects/${projectId}/chapters/${chapterId}/quality`, { method: 'POST', body: JSON.stringify({ mode }) });
  },
  waiveQualityReport(projectId: string, chapterId: string, reportId: string, note: string) {
    return request<{ report: QualityReport; decision: { allowed: true; waived: true } }>(`/api/projects/${projectId}/chapters/${chapterId}/quality/${reportId}/waive`, { method: 'POST', body: JSON.stringify({ author: 'local-user', note }) });
  },
  getProjectDashboard(projectId: string) {
    return request<{ volumeCount: number; plannedChapterCount: number; acceptedChapterCount: number; missingChapterCount: number; acceptedCharacters: number; characterCount: number; relationshipCount: number; worldBookCount: number; timelineEventCount: number; unresolvedForeshadowing: number; updatedAt: string }>(`/api/projects/${projectId}/dashboard`);
  },
  createProjectBackup(projectId: string) {
    return request<{ id: string; createdAt: string }>(`/api/projects/${projectId}/backups`, { method: 'POST' });
  },
};
