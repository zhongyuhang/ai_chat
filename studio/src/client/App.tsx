import { useState } from 'react';
import { ProjectCenter } from './projects/ProjectCenter';
import { CanonWorkspace } from './canon/CanonWorkspace';

type Workspace = 'projects' | 'canon' | 'studio' | 'theatre';

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>('projects');
  const [projectId, setProjectId] = useState<string>();
  const open = (next: Workspace, id: string) => { setProjectId(id); setWorkspace(next); };
  const navigation = [
    { label: '项目中心', workspace: 'projects' as const },
    { label: '小说工坊', workspace: 'studio' as const },
    { label: '角色剧场', workspace: 'theatre' as const },
  ];

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="topbar"><div><p className="eyebrow">LOCAL · DEEPSEEK · TEXT ONLY</p><h1>本地 AI 小说工作台</h1></div><span className="local-badge">仅本机</span></header>
    <div className="workspace">
      <nav className="sidebar" aria-label="工作区导航">{navigation.map((item) => <button className={workspace === item.workspace ? 'nav-item active' : 'nav-item'} disabled={item.workspace !== 'projects' && !projectId} key={item.label} type="button" onClick={() => setWorkspace(item.workspace)}><span>{item.label}</span>{item.workspace !== 'projects' && !projectId && <small>先选项目</small>}</button>)}</nav>
      {workspace === 'projects' && <ProjectCenter onOpenCanon={(id) => open('canon', id)} onOpenStudio={(id) => open('studio', id)} />}
      {workspace === 'canon' && projectId && <CanonWorkspace projectId={projectId} onBack={() => setWorkspace('projects')} />}
      {workspace === 'studio' && <main className="main-content" id="main-content"><h2>小说工坊</h2><p>章节编辑器正在接入。</p></main>}
      {workspace === 'theatre' && <main className="main-content" id="main-content"><h2>角色剧场</h2><p>分支会话编辑器正在接入。</p></main>}
    </div>
  </div>;
}
