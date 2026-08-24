import { z } from 'zod';
import { CharacterSchema } from '../../shared/contracts/canon.js';
import { EntityIdSchema, IsoTimestampSchema } from '../../shared/contracts/common.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import type { CanonService } from './canon-service.js';

const ProposalSchema = z.object({
  schemaVersion: z.literal(1),
  id: EntityIdSchema,
  kind: z.enum(['character-update', 'relationship-update', 'worldbook-entry', 'timeline-event', 'foreshadowing']),
  targetId: EntityIdSchema.optional(),
  patch: z.record(z.string(), z.unknown()),
  source: z.object({ kind: z.enum(['chapter', 'theatre', 'manual']), id: EntityIdSchema }),
  status: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: IsoTimestampSchema,
  decidedAt: IsoTimestampSchema.optional(),
});
const ProposalList = z.array(ProposalSchema);
type Proposal = z.infer<typeof ProposalSchema>;

export function createProposalService(options: {
  repository: ProjectRepository;
  canon: CanonService;
  idFactory?: () => string;
  clock?: () => Date;
}) {
  const idFactory = options.idFactory ?? (() => `proposal_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
  const clock = options.clock ?? (() => new Date());

  async function list(projectId: string): Promise<Proposal[]> {
    return ProposalList.parse(await options.repository.readCanon(projectId, 'proposals') ?? []);
  }
  async function persist(projectId: string, proposals: Proposal[]) {
    await options.repository.saveCanon(projectId, 'proposals', ProposalList.parse(proposals));
  }
  async function create(projectId: string, input: Omit<z.input<typeof ProposalSchema>, 'schemaVersion' | 'id' | 'status' | 'createdAt'>) {
    const proposal = ProposalSchema.parse({ schemaVersion: 1, id: idFactory(), status: 'pending', createdAt: clock().toISOString(), ...input });
    await persist(projectId, [...await list(projectId), proposal]);
    return proposal;
  }
  async function accept(projectId: string, proposalId: string) {
    const proposals = await list(projectId);
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal) throw Object.assign(new Error('设定提案不存在。'), { code: 'PROPOSAL_NOT_FOUND', statusCode: 404 });
    if (proposal.status !== 'pending') return proposal;
    if (proposal.kind === 'character-update') {
      const character = (await options.canon.getBundle(projectId)).characters.find((item) => item.id === proposal.targetId);
      if (!character) throw Object.assign(new Error('提案目标角色不存在。'), { code: 'PROPOSAL_TARGET_MISSING', statusCode: 404 });
      const currentStatePatch = proposal.patch.currentState;
      const updated = CharacterSchema.parse({
        ...character,
        currentState: currentStatePatch && typeof currentStatePatch === 'object'
          ? { ...character.currentState, ...currentStatePatch as Record<string, unknown> }
          : character.currentState,
        updatedAt: clock().toISOString(),
      });
      await options.canon.saveCharacter(projectId, updated);
    } else {
      throw Object.assign(new Error('此类提案的采用器尚未注册。'), { code: 'PROPOSAL_KIND_UNSUPPORTED', statusCode: 422 });
    }
    proposal.status = 'accepted';
    proposal.decidedAt = clock().toISOString();
    await persist(projectId, proposals);
    return proposal;
  }
  async function reject(projectId: string, proposalId: string) {
    const proposals = await list(projectId);
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal) throw Object.assign(new Error('设定提案不存在。'), { code: 'PROPOSAL_NOT_FOUND', statusCode: 404 });
    if (proposal.status === 'pending') {
      proposal.status = 'rejected';
      proposal.decidedAt = clock().toISOString();
      await persist(projectId, proposals);
    }
    return proposal;
  }
  return { create, list, accept, reject };
}

export type ProposalService = ReturnType<typeof createProposalService>;
