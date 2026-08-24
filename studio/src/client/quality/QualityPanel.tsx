import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type QualityIssue, type QualityReport } from '../api/client';

const categoryLabel: Record<string, string> = { plotLogic: '情节逻辑', character: '人物一致性', prose: '文字表达', continuity: '连续性', viewpoint: '视角', pacing: '节奏', dialogue: '对白', serialHook: '连载钩子', originality: '原创与重复', mechanics: '格式与标点' };
const severityLabel = { info: '提示', warning: '警告', error: '错误', fatal: '致命' };

export function QualityPanel({ projectId, chapterId, onLocate, onNotice }: { projectId: string; chapterId: string; onLocate: (issue: QualityIssue, report: QualityReport) => void; onNotice: (message: string) => void }) {
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ['quality-reports', projectId], queryFn: () => api.listQualityReports(projectId) });
  const [report, setReport] = useState<QualityReport>();
  const [waiving, setWaiving] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    const latest = reports.data?.filter((item) => item.chapterId === chapterId).at(-1);
    if (latest) setReport(latest);
  }, [chapterId, reports.data]);
  const review = useMutation({
    mutationFn: (mode: 'serial' | 'publication') => api.reviewChapter(projectId, chapterId, mode),
    onSuccess: async ({ report: next }) => { setReport(next); await queryClient.invalidateQueries({ queryKey: ['quality-reports', projectId] }); },
  });
  const waive = useMutation({
    mutationFn: () => api.waiveQualityReport(projectId, chapterId, report!.id, note),
    onSuccess: async ({ report: next }) => { setReport(next); setWaiving(false); setNote(''); onNotice('已记录人工豁免'); await queryClient.invalidateQueries({ queryKey: ['quality-reports', projectId] }); },
  });
  const allowed = report && !report.fatalDefects.length && report.total >= report.threshold;

  return <section className="quality-panel">
    <div className="panel-heading"><div><p className="section-kicker">QUALITY GATE</p><h3>审校与出版门</h3></div><div className="inline-actions"><button className="quiet-button" type="button" disabled={review.isPending} onClick={() => review.mutate('serial')}>连载审校</button><button className="quiet-button" type="button" disabled={review.isPending} onClick={() => review.mutate('publication')}>出版审校</button></div></div>
    {review.isError && <p className="form-error" role="alert">{review.error.message}</p>}
    {report && <div className="quality-report"><div className="quality-score"><div><h4>{report.mode === 'publication' ? '出版质量报告' : '连载质量报告'}</h4><strong>总分 {report.total} / 100</strong><span>门槛 {report.threshold}</span></div><p>本地确定性审校已完成；语义维度按保守基线计分，不会伪装成已完成的模型审稿。</p></div>
      <div className="score-grid">{Object.entries(report.categoryScores).map(([category, score]) => <div key={category}><span>{categoryLabel[category] ?? category}</span><strong>{score.toFixed(1)}</strong></div>)}</div>
      <div className="issue-list"><h4>问题引用（{report.issues.length}）</h4>{report.issues.map((issue) => <button type="button" key={issue.id} onClick={() => onLocate(issue, report)}><span className={`issue-severity ${issue.severity}`}>{severityLabel[issue.severity]}</span><strong>{issue.message}</strong><small>{issue.code} · {issue.start}–{issue.end} · {issue.excerpt || '空范围'}</small></button>)}{!report.issues.length && <p className="empty-note">本地规则未发现可确定的问题。</p>}</div>
      <div className="quality-actions"><button className="primary-action" type="button" disabled={!allowed} onClick={() => onNotice('质量门已通过；当前正式稿保持不变。')}>采用达标稿</button>{!allowed && !report.waiver && <button className="quiet-button" type="button" onClick={() => setWaiving(true)}>记录理由后采用</button>}{report.waiver && <span className="waiver-badge">已记录人工豁免</span>}</div>
    </div>}
    {waiving && <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="waiver-title"><div className="dialog-heading"><h2 id="waiver-title">记录质量门豁免</h2></div><label>采用理由<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><p>报告和全部问题会保留，不会因豁免被删除。</p><div className="dialog-actions"><button className="quiet-button" type="button" onClick={() => setWaiving(false)}>取消</button><button className="primary-action" type="button" disabled={!note.trim() || waive.isPending} onClick={() => waive.mutate()}>确认采用并记录</button></div></section></div>}
  </section>;
}
