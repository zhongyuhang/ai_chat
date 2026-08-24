import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { TheatreSessionSchema, type TheatreSession } from '../../shared/contracts/theatre.js';
import { atomicWriteJson } from '../projects/atomic-file.js';
import { resolveProjectPath } from '../projects/project-paths.js';
import { appendMessage, editAndBranch, retryFrom, selectBranch, deleteLeaf } from './message-graph.js';

interface Options {
  dataRoot: string;
  clock?: () => Date;
  idFactory?: (prefix: string) => string;
}

function defaultId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function createTheatreRepository(options: Options) {
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultId;
  const file = (projectId: string, sessionId: string) => resolveProjectPath(options.dataRoot, projectId, 'theatre', 'sessions', `${sessionId}.json`);

  async function save(session: TheatreSession): Promise<TheatreSession> {
    session.updatedAt = clock().toISOString();
    const parsed = TheatreSessionSchema.parse(session);
    await atomicWriteJson(file(parsed.projectId, parsed.id), parsed);
    return parsed;
  }
  async function get(projectId: string, sessionId: string): Promise<TheatreSession | null> {
    try {
      return TheatreSessionSchema.parse(JSON.parse(await readFile(file(projectId, sessionId), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async function requireSession(projectId: string, sessionId: string) {
    const session = await get(projectId, sessionId);
    if (!session) throw Object.assign(new Error('剧场会话不存在。'), { code: 'THEATRE_SESSION_NOT_FOUND', statusCode: 404 });
    return session;
  }
  async function list(projectId: string): Promise<TheatreSession[]> {
    const directory = resolveProjectPath(options.dataRoot, projectId, 'theatre', 'sessions');
    const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const sessions = await Promise.all(entries.filter((entry) => entry.endsWith('.json')).map(async (entry) => (
      TheatreSessionSchema.parse(JSON.parse(await readFile(resolveProjectPath(options.dataRoot, projectId, 'theatre', 'sessions', entry), 'utf8')))
    )));
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function create(input: {
    projectId: string;
    title: string;
    participantIds: string[];
    opening: { role: 'user' | 'assistant' | 'system'; content: string };
    userPersona?: string;
    narratorMode?: TheatreSession['narratorMode'];
  }) {
    const now = clock().toISOString();
    const rootId = idFactory('message');
    const session = TheatreSessionSchema.parse({
      schemaVersion: 1,
      id: idFactory('session'),
      projectId: input.projectId,
      title: input.title,
      participantIds: input.participantIds,
      userPersona: input.userPersona,
      narratorMode: input.narratorMode,
      graph: {
        schemaVersion: 1,
        rootId,
        activeLeafId: rootId,
        nodes: { [rootId]: { id: rootId, parentId: null, children: [], role: input.opening.role, content: input.opening.content, createdAt: now } },
        selectedChildren: {},
      },
      createdAt: now,
      updatedAt: now,
    });
    return save(session);
  }
  async function append(projectId: string, sessionId: string, parentId: string, input: { role: 'user' | 'assistant' | 'system'; content: string; runId?: string }) {
    const session = await requireSession(projectId, sessionId);
    session.graph = appendMessage(session.graph, parentId, { id: idFactory('message'), ...input, createdAt: clock().toISOString() });
    return save(session);
  }
  async function edit(projectId: string, sessionId: string, nodeId: string, input: { role: 'user' | 'assistant' | 'system'; content: string }) {
    const session = await requireSession(projectId, sessionId);
    session.graph = editAndBranch(session.graph, nodeId, { id: idFactory('message'), ...input, createdAt: clock().toISOString() });
    return save(session);
  }
  async function retry(projectId: string, sessionId: string, parentId: string, input: { role: 'user' | 'assistant' | 'system'; content: string; runId?: string }) {
    const session = await requireSession(projectId, sessionId);
    session.graph = retryFrom(session.graph, parentId, { id: idFactory('message'), ...input, createdAt: clock().toISOString() });
    return save(session);
  }
  async function select(projectId: string, sessionId: string, parentId: string, childId: string) {
    const session = await requireSession(projectId, sessionId);
    session.graph = selectBranch(session.graph, parentId, childId);
    return save(session);
  }
  async function removeLeaf(projectId: string, sessionId: string, nodeId: string) {
    const session = await requireSession(projectId, sessionId);
    session.graph = deleteLeaf(session.graph, nodeId);
    return save(session);
  }
  async function pinMemory(projectId: string, sessionId: string, memory: string) {
    const session = await requireSession(projectId, sessionId);
    const text = memory.trim();
    if (text && !session.pinnedMemory.includes(text)) session.pinnedMemory.push(text);
    return save(session);
  }
  return { create, list, get, append, edit, retry, select, removeLeaf, pinMemory };
}

export type TheatreRepository = ReturnType<typeof createTheatreRepository>;
