import type { TheatreSession } from '../api/client';

export function activePath(session: TheatreSession) {
  const path = [];
  let currentId: string | undefined = session.graph.rootId;
  while (currentId) {
    path.push(session.graph.nodes[currentId]);
    currentId = session.graph.selectedChildren[currentId];
  }
  return path;
}

export function BranchNavigator({ session, parentId, onSelect }: { session: TheatreSession; parentId: string; onSelect: (childId: string) => void }) {
  const children = session.graph.nodes[parentId]?.children ?? [];
  if (children.length < 2) return null;
  const selected = session.graph.selectedChildren[parentId];
  return <div className="branch-navigator"><span>此处有 {children.length} 个回复分支</span>{children.map((childId, index) => <button className={selected === childId ? 'selected' : ''} type="button" key={childId} onClick={() => onSelect(childId)}>分支 {index + 1}</button>)}</div>;
}
