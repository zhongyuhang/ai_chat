import { lazy, Suspense, useEffect, useState } from 'react';
import { ProjectCenter } from './projects/ProjectCenter';
import { CanonWorkspace } from './canon/CanonWorkspace';

const NovelStudio = lazy(() => import('./studio/NovelStudio').then((module) => ({ default: module.NovelStudio })));
const CharacterTheatre = lazy(() => import('./theatre/CharacterTheatre').then((module) => ({ default: module.CharacterTheatre })));

type Workspace = 'projects' | 'canon' | 'studio' | 'theatre';

function readLocation(): { workspace: Workspace; projectId?: string } {
  const parameters = new URLSearchParams(window.location.search);
  const projectId = parameters.get('project') || undefined;
  const requested = parameters.get('workspace');
  const workspace = requested === 'canon' || requested === 'studio' || requested === 'theatre' ? requested : 'projects';
  return projectId || workspace === 'projects' ? { workspace, projectId } : { workspace: 'projects' };
}

export function App() {
  const initial = readLocation();
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const [projectId, setProjectId] = useState<string | undefined>(initial.projectId);
  function open(next: Workspace, id = projectId) {
    const parameters = new URLSearchParams();
    if (next !== 'projects') parameters.set('workspace', next);
    if (id) parameters.set('project', id);
    window.history.pushState({}, '', parameters.size ? `?${parameters.toString()}` : window.location.pathname);
    setProjectId(id);
    setWorkspace(next);
  }
  useEffect(() => {
    const syncLocation = () => {
      const next = readLocation();
      setWorkspace(next.workspace);
      setProjectId(next.projectId);
    };
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);
  const navigation = [
    { label: '项目中心', workspace: 'projects' as const },
    { label: '小说工坊', workspace: 'studio' as const },
    { label: '角色剧场', workspace: 'theatre' as const },
  ];

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="topbar"><div><p className="eyebrow">LOCAL · DEEPSEEK · TEXT ONLY</p><h1>本地 AI 小说工作台</h1></div><span className="local-badge">仅本机</span></header>
    <div className="workspace">
      <nav className="sidebar" aria-label="工作区导航">{navigation.map((item) => <button className={workspace === item.workspace ? 'nav-item active' : 'nav-item'} disabled={item.workspace !== 'projects' && !projectId} key={item.label} type="button" onClick={() => open(item.workspace)}><span>{item.label}</span>{item.workspace !== 'projects' && !projectId && <small>先选项目</small>}</button>)}</nav>
      {workspace === 'projects' && <ProjectCenter onOpenCanon={(id) => open('canon', id)} onOpenStudio={(id) => open('studio', id)} />}
      {workspace === 'canon' && projectId && <CanonWorkspace projectId={projectId} onBack={() => open('projects')} />}
      {workspace === 'studio' && projectId && <Suspense fallback={<main className="main-content" id="main-content"><p className="loading-state" role="status">正在加载小说编辑器…</p></main>}><NovelStudio projectId={projectId} onBack={() => open('projects')} /></Suspense>}
      {workspace === 'theatre' && projectId && <Suspense fallback={<main className="main-content" id="main-content"><p className="loading-state" role="status">正在加载角色剧场…</p></main>}><CharacterTheatre projectId={projectId} onBack={() => open('projects')} /></Suspense>}
    </div>
  </div>;
}
