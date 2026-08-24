import { describe, expect, it } from 'vitest';
import {
  appendMessage,
  createMessageGraph,
  deleteLeaf,
  editAndBranch,
  getActivePath,
  selectBranch,
} from '../../src/server/theatre/message-graph.js';

const timestamp = '2026-08-24T00:00:00.000Z';
const userNode = (id: string, content: string) => ({ id, role: 'user' as const, content, createdAt: timestamp });
const assistantNode = (id: string, content: string) => ({ id, role: 'assistant' as const, content, createdAt: timestamp });

describe('theatre message graph', () => {
  it('editing a prior message creates a sibling branch without deleting history', () => {
    let graph = createMessageGraph(userNode('user_001', '原问题'));
    const before = graph;
    graph = appendMessage(graph, 'user_001', assistantNode('assistant_001', '原回答'));
    expect(before.nodes.user_001.children).toEqual([]);
    graph = editAndBranch(graph, 'user_001', userNode('user_002', '修改后的问题'));
    graph = appendMessage(graph, 'user_002', assistantNode('assistant_002', '新回答'));

    expect(graph.nodes.user_001.children).toEqual(['assistant_001', 'user_002']);
    expect(getActivePath(selectBranch(graph, 'user_001', 'assistant_001')).map((node) => node.id)).toEqual(['user_001', 'assistant_001']);
    expect(getActivePath(selectBranch(graph, 'user_001', 'user_002')).map((node) => node.id)).toEqual(['user_001', 'user_002', 'assistant_002']);
  });

  it('allows only leaf deletion and preserves the remaining sibling branch', () => {
    let graph = createMessageGraph(userNode('user_001', '问题'));
    graph = appendMessage(graph, 'user_001', assistantNode('assistant_001', '回答一'));
    graph = appendMessage(graph, 'user_001', assistantNode('assistant_002', '回答二'));
    expect(() => deleteLeaf(graph, 'user_001')).toThrow(expect.objectContaining({ code: 'THEATRE_NODE_NOT_LEAF' }));
    graph = deleteLeaf(graph, 'assistant_002');
    expect(graph.nodes.assistant_001.content).toBe('回答一');
    expect(graph.nodes.assistant_002).toBeUndefined();
  });
});
