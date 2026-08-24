const navigation = [
  { label: '项目中心', active: true },
  { label: '小说工坊', active: false },
  { label: '角色剧场', active: false },
];

export function App() {
  return (
    <div className="app-shell">
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

        <main className="main-content">
          <section className="hero-card" aria-labelledby="project-center-title">
            <p className="section-kicker">PROJECT CENTER</p>
            <h2 id="project-center-title">项目中心</h2>
            <p>在这里建立长篇作品的唯一事实源。正文、设定与每次修订都保存在本地文件中。</p>
            <div className="hero-actions">
              <button className="primary-action" type="button" disabled>新建小说</button>
              <span>项目持久化能力将在下一步接通</span>
            </div>
          </section>

          <section className="capability-grid" aria-label="工作台能力">
            <article>
              <span className="index">01</span>
              <h3>无损正文</h3>
              <p>已接受章节使用 Markdown 原子写入，并在替换前建立修订。</p>
            </article>
            <article>
              <span className="index">02</span>
              <h3>可解释记忆</h3>
              <p>角色、世界书、时间线和伏笔按来源装配，不靠模糊聊天摘要。</p>
            </article>
            <article>
              <span className="index">03</span>
              <h3>双模式创作</h3>
              <p>连载速度与出版精修采用独立质量门槛，并允许逐候选验收。</p>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
