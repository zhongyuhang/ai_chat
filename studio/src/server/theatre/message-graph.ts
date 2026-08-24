import {
  TheatreMessageGraphSchema,
  TheatreMessageNodeSchema,
  type TheatreMessageGraph,
  type TheatreMessageNode,
} from '../../shared/contracts/theatre.js';

type NewNode = Omit<TheatreMessageNode, 'parentId' | 'children'>;

function graphError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code, statusCode: 409, retryable: false });
}

function validateGraph(value: TheatreMessageGraph): TheatreMessageGraph {
  const graph = TheatreMessageGraphSchema.parse(value);
  const root = graph.nodes[graph.rootId];
  if (!root || root.parentId !== null) graphError('THEATRE_GRAPH_INVALID', '剧场根消息不合法。');
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) graphError('THEATRE_GRAPH_CYCLE', '剧场消息图存在循环。');
    const node = graph.nodes[id];
    if (!node) graphError('THEATRE_GRAPH_INVALID', '剧场消息引用不存在。');
    visited.add(id);
    for (const childId of node.children) {
      if (graph.nodes[childId]?.parentId !== id) graphError('THEATRE_GRAPH_INVALID', '剧场父子引用不一致。');
      visit(childId);
    }
  };
  visit(graph.rootId);
  if (visited.size !== Object.keys(graph.nodes).length) graphError('THEATRE_GRAPH_ORPHAN', '剧场消息图存在孤立节点。');
  for (const [parentId, childId] of Object.entries(graph.selectedChildren)) {
    if (!graph.nodes[parentId]?.children.includes(childId)) graphError('THEATRE_BRANCH_INVALID', '活动分支不属于父消息。');
  }
  return graph;
}

function clone(graph: TheatreMessageGraph): TheatreMessageGraph {
  return structuredClone(graph);
}

function deepestSelected(graph: TheatreMessageGraph, startId: string): string {
  let current = startId;
  const seen = new Set<string>();
  while (graph.selectedChildren[current]) {
    if (seen.has(current)) graphError('THEATRE_GRAPH_CYCLE', '活动分支存在循环。');
    seen.add(current);
    current = graph.selectedChildren[current];
  }
  return current;
}

export function createMessageGraph(rootInput: NewNode): TheatreMessageGraph {
  const root = TheatreMessageNodeSchema.parse({ ...rootInput, parentId: null, children: [] });
  return validateGraph({ schemaVersion: 1, rootId: root.id, activeLeafId: root.id, nodes: { [root.id]: root }, selectedChildren: {} });
}

export function appendMessage(graphInput: TheatreMessageGraph, parentId: string, nodeInput: NewNode): TheatreMessageGraph {
  const graph = clone(validateGraph(graphInput));
  const parent = graph.nodes[parentId];
  if (!parent) graphError('THEATRE_PARENT_MISSING', '父消息不存在。');
  if (graph.nodes[nodeInput.id]) graphError('THEATRE_NODE_EXISTS', '消息 ID 已存在。');
  const node = TheatreMessageNodeSchema.parse({ ...nodeInput, parentId, children: [] });
  graph.nodes[node.id] = node;
  parent.children.push(node.id);
  graph.selectedChildren[parentId] = node.id;
  graph.activeLeafId = node.id;
  return validateGraph(graph);
}

export function editAndBranch(graph: TheatreMessageGraph, editedNodeId: string, replacement: NewNode): TheatreMessageGraph {
  return appendMessage(graph, editedNodeId, { ...replacement, revision: { ...replacement.revision, editedFromId: editedNodeId } });
}

export function retryFrom(graph: TheatreMessageGraph, parentId: string, replacement: NewNode): TheatreMessageGraph {
  return appendMessage(graph, parentId, { ...replacement, revision: { ...replacement.revision, retriedFromId: parentId } });
}

export function selectBranch(graphInput: TheatreMessageGraph, parentId: string, childId: string): TheatreMessageGraph {
  const graph = clone(validateGraph(graphInput));
  if (!graph.nodes[parentId]?.children.includes(childId)) graphError('THEATRE_BRANCH_INVALID', '所选分支不存在。');
  graph.selectedChildren[parentId] = childId;
  graph.activeLeafId = deepestSelected(graph, childId);
  return validateGraph(graph);
}

export function getActivePath(graphInput: TheatreMessageGraph): TheatreMessageNode[] {
  const graph = validateGraph(graphInput);
  const path: TheatreMessageNode[] = [];
  let currentId: string | undefined = graph.rootId;
  while (currentId) {
    path.push(graph.nodes[currentId]);
    currentId = graph.selectedChildren[currentId];
  }
  return path;
}

export function deleteLeaf(graphInput: TheatreMessageGraph, nodeId: string): TheatreMessageGraph {
  const graph = clone(validateGraph(graphInput));
  const node = graph.nodes[nodeId];
  if (!node || nodeId === graph.rootId || node.children.length) graphError('THEATRE_NODE_NOT_LEAF', '只能删除非根叶子消息。');
  const parent = graph.nodes[node.parentId!];
  parent.children = parent.children.filter((id) => id !== nodeId);
  delete graph.nodes[nodeId];
  if (graph.selectedChildren[parent.id] === nodeId) {
    const fallback = parent.children.at(-1);
    if (fallback) graph.selectedChildren[parent.id] = fallback;
    else delete graph.selectedChildren[parent.id];
  }
  graph.activeLeafId = deepestSelected(graph, graph.rootId);
  return validateGraph(graph);
}
