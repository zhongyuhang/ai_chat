import type { ContextPreview as ContextPreviewData } from '../api/client';

const statusLabel = { included: '已纳入', 'omitted-budget': '因预算省略', missing: '来源缺失' };

export function ContextPreview({ preview }: { preview: ContextPreviewData }) {
  const total = preview.inputTokens + preview.reservedOutputTokens;
  return <section className="context-preview" aria-label="上下文预览">
    <div className="panel-heading"><div><p className="section-kicker">CONTEXT MANIFEST</p><h4>上下文预算</h4></div><strong>{total.toLocaleString('zh-CN')} tokens</strong></div>
    <p>输入约 {preview.inputTokens.toLocaleString('zh-CN')} · 为输出预留 {preview.reservedOutputTokens.toLocaleString('zh-CN')}</p>
    <div className="prompt-tags">{preview.promptManifest.map((prompt) => <code key={`${prompt.id}-${prompt.version}`}>{prompt.id}@{prompt.version}</code>)}</div>
    <ol>{preview.manifest.map((item) => <li key={`${item.kind}-${item.sourceId}`}><div><strong>{item.sourceId}</strong><small>{item.kind} · {item.reason}</small></div><span className={`manifest-status ${item.status}`}>{statusLabel[item.status]} · {item.estimatedTokens}</span></li>)}</ol>
    {!preview.manifest.length && <p className="empty-note">当前没有可检索的设定；建议先完善角色与章纲。</p>}
  </section>;
}
