import { ProjectCenter } from './projects/ProjectCenter';

const navigation = [
  { label: '项目中心', active: true },
  { label: '小说工坊', active: false },
  { label: '角色剧场', active: false },
];

export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="topbar">
        <div>
          <p className="eyebrow">LOCAL · DEEPSEEK · TEXT ONLY</p>
          <h1>本地 AI 小说工作台</h1>
        </div>
        <span className="local-badge">仅本机</span>
      </header>

      <div className="workspace">
        <nav className="sidebar" aria-label="工作区导航">
          {navigation.map((item) => (
            <button
              className={item.active ? 'nav-item active' : 'nav-item'}
              disabled={!item.active}
              key={item.label}
              type="button"
            >
              <span>{item.label}</span>
              {!item.active && <small>建设中</small>}
            </button>
          ))}
        </nav>

        <ProjectCenter />
      </div>
    </div>
  );
}
