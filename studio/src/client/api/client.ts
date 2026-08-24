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
};
