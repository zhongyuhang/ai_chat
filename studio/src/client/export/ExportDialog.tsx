import { useState } from 'react';

export function ExportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [format, setFormat] = useState('markdown');
  const [includePlaceholders, setIncludePlaceholders] = useState(false);
  function download() {
    const anchor = document.createElement('a');
    anchor.href = `/api/projects/${projectId}/export?format=${format}&includePlaceholders=${includePlaceholders}`;
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="export-title"><div className="dialog-heading"><div><p className="section-kicker">ACCEPTED MANUSCRIPT</p><h2 id="export-title">导出作品</h2></div><button className="quiet-button" type="button" onClick={onClose}>关闭</button></div><p>仅导出正式稿和书名/卷名/章名，不包含候选、提示词、API 密钥或生成运行记录。</p><label>导出格式<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="markdown">Markdown（.md）</option><option value="txt">纯文本（.txt）</option><option value="json">可迁移 JSON</option><option value="docx">Word（.docx）</option></select></label><label className="checkbox-label"><input type="checkbox" checked={includePlaceholders} onChange={(event) => setIncludePlaceholders(event.target.checked)} />为缺失正式稿的章纲加入空占位</label><div className="dialog-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className="primary-action" type="button" onClick={download}>生成并下载</button></div></section></div>;
}
