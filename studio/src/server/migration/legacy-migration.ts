import { createHash } from 'node:crypto';
import {
  LegacyExportSchema,
  LegacySessionSchema,
  type LegacySession,
} from '../../shared/contracts/migration.js';
import type { ProjectRepository } from '../projects/project-repository.js';

interface PreviewSession {
  sourceId: string;
  title: string;
  messageCount: number;
  valid: boolean;
  issues: string[];
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function inspectSession(value: unknown, index: number): { preview: PreviewSession; session?: LegacySession } {
  const result = LegacySessionSchema.safeParse(value);
  if (result.success) {
    return {
      session: result.data,
      preview: {
        sourceId: result.data.id,
        title: result.data.title,
        messageCount: result.data.messages.length,
        valid: true,
        issues: [],
      },
    };
  }
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    preview: {
      sourceId: typeof candidate.id === 'string' ? candidate.id : `index:${index}`,
      title: typeof candidate.title === 'string' ? candidate.title : `无效会话 ${index + 1}`,
      messageCount: Array.isArray(candidate.messages) ? candidate.messages.length : 0,
      valid: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.') || 'session'}: ${issue.message}`),
    },
  };
}

export function previewLegacyMigration(value: unknown) {
  const payload = LegacyExportSchema.parse(value);
  const inspected = payload.sessions.map(inspectSession);
  const settingsMapping = {
    temperature: typeof payload.settings.temperature === 'number' ? payload.settings.temperature : undefined,
    pinnedPrompt: typeof payload.settings.pinnedPrompt === 'string' ? payload.settings.pinnedPrompt : undefined,
  };
  return {
    fingerprint: fingerprint(payload),
    sessions: inspected.map((item) => item.preview),
    validSessions: inspected.filter((item) => item.session).length,
    invalidSessions: inspected.filter((item) => !item.session).length,
    estimatedBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
    settingsMapping,
  };
}

function sessionMarkdown(session: LegacySession): string {
  const blocks = [`# ${session.title}`];
  if (session.summary) blocks.push(`> 旧版摘要：${session.summary.replaceAll('\n', '\n> ')}`);
  for (const message of session.messages) {
    const label = { user: '用户', assistant: '助手', system: '系统', error: '错误' }[message.role];
    blocks.push(`## ${label}\n\n${message.content}`);
  }
  return `${blocks.join('\n\n')}\n`;
}

export async function applyLegacyMigration(
  input: { payload: unknown; fingerprint: string },
  repository: ProjectRepository,
) {
  const payload = LegacyExportSchema.parse(input.payload);
  const preview = previewLegacyMigration(payload);
  if (preview.fingerprint !== input.fingerprint) {
    throw Object.assign(new Error('迁移预览已过期，请重新检测旧版数据。'), { code: 'MIGRATION_PREVIEW_STALE' });
  }
  const sessions = payload.sessions.flatMap((value) => {
    const result = LegacySessionSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
  const project = await repository.createProject({
    title: `旧版导入 ${new Date().toISOString().slice(0, 10)}`,
    synopsis: '由旧版浏览器会话非破坏性迁移生成。',
    writingMode: 'both',
    narrative: preview.settingsMapping.pinnedPrompt
      ? { languageRules: [preview.settingsMapping.pinnedPrompt] }
      : undefined,
  });
  const chapterIds: string[] = [];
  for (const [index, session] of sessions.entries()) {
    const chapterId = `legacy_${String(index + 1).padStart(4, '0')}`;
    await repository.saveChapterRevision(project.id, chapterId, sessionMarkdown(session), {
      reason: `legacy-import:${session.id}`,
    });
    chapterIds.push(chapterId);
  }
  return { project, importedSessions: sessions.length, chapterIds };
}
