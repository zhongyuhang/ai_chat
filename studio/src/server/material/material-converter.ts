import { SceneCardSchema } from '../../shared/contracts/outline.js';
import type { CanonService } from '../canon/canon-service.js';
import type { TheatreRepository } from '../theatre/theatre-repository.js';

type ConversionInput = {
  projectId: string;
  sessionId: string;
  nodeId: string;
  kind: 'branch-to-scene-card';
  title: string;
};

export function createMaterialConverter(options: {
  theatre: TheatreRepository;
  canon: CanonService;
  idFactory?: (prefix: string) => string;
}) {
  const idFactory = options.idFactory ?? ((prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);

  async function convert(input: ConversionInput) {
    const session = await options.theatre.get(input.projectId, input.sessionId);
    if (!session) throw Object.assign(new Error('剧场会话不存在。'), { code: 'THEATRE_SESSION_NOT_FOUND', statusCode: 404 });
    const leaf = session.graph.nodes[input.nodeId];
    if (!leaf) throw Object.assign(new Error('所选分支节点不存在。'), { code: 'THEATRE_NODE_NOT_FOUND', statusCode: 404 });
    const path = [];
    let current = leaf;
    while (current) {
      path.unshift(current);
      current = current.parentId ? session.graph.nodes[current.parentId] : undefined!;
    }
    if (path[0]?.id !== session.graph.rootId) throw Object.assign(new Error('所选节点不属于当前会话。'), { code: 'THEATRE_BRANCH_INVALID', statusCode: 409 });
    const sceneCard = SceneCardSchema.parse({
      id: idFactory('scene'),
      title: input.title,
      participantIds: session.participantIds,
      entryState: session.userPersona,
      beats: path.filter((node) => node.role !== 'system').map((node) => `${node.role === 'user' ? '用户' : '角色'}：${node.content}`),
      exitState: JSON.stringify(session.state),
    });
    return { kind: input.kind, source: { sessionId: input.sessionId, nodeId: input.nodeId }, sceneCard };
  }

  return { convert };
}

export type MaterialConverter = ReturnType<typeof createMaterialConverter>;
