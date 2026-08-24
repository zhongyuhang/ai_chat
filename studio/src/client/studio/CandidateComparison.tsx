import { useEffect, useState } from 'react';
import type { GenerationRunDetail } from '../api/client';

const runStatus = { queued: '排队中', generating: '生成中', completed: '生成完成', failed: '生成失败', interrupted: '已中断', cancelled: '已取消' };

export function CandidateComparison({ run, accepting, onAccept, onCancel }: {
  run: GenerationRunDetail;
  accepting: boolean;
  onAccept: (candidateId: string) => void;
  onCancel: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    if (!run.candidates.some((candidate) => candidate.id === selectedId)) setSelectedId(run.candidates[0]?.id ?? '');
  }, [run.candidates, selectedId]);
  const selected = run.candidates.find((candidate) => candidate.id === selectedId) ?? run.candidates[0];
  const active = run.status === 'queued' || run.status === 'generating';

  return <section className="candidate-comparison" aria-live="polite">
    <div className="panel-heading"><div><p className="section-kicker">RUN {run.id}</p><h4>{runStatus[run.status]}</h4></div>{active && <button className="quiet-button danger-button" type="button" onClick={onCancel}>停止生成</button>}</div>
    {run.error && <p className="form-error" role="alert">{run.error.message}（{run.error.code}）</p>}
    {run.candidates.length > 0 && <>
      <div className="candidate-tabs" role="tablist" aria-label="候选稿">{run.candidates.map((candidate, index) => <button role="tab" aria-selected={candidate.id === selected?.id} type="button" key={candidate.id} onClick={() => setSelectedId(candidate.id)}>候选 {index + 1}</button>)}</div>
      {selected && <article className="candidate-prose" role="tabpanel"><pre>{selected.content}</pre>{run.status === 'completed' && <button className="primary-action" type="button" disabled={accepting} onClick={() => onAccept(selected.id)}>{accepting ? '采用中…' : '采用此稿'}</button>}</article>}
    </>}
    {active && !run.candidates.length && <p className="loading-state">正在等待第一个文本片段…</p>}
  </section>;
}
