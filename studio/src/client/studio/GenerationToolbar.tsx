import { useState } from 'react';
import type { ContextPreview, GenerationTaskInput, WritingTaskKind } from '../api/client';
import { ContextPreview as ContextPreviewPanel } from './ContextPreview';

const actions: Array<{ kind: WritingTaskKind; label: string; instruction: string }> = [
  { kind: 'chapter-draft', label: '生成正文', instruction: '根据当前章纲、已确认设定和伏笔，生成完整章节正文。' },
  { kind: 'continue', label: '续写正文', instruction: '紧接正式稿末尾继续写作，保持人物声音、状态和因果连续。' },
  { kind: 'polish-selection', label: '语言润色', instruction: '在不改变事实、情节与人物动机的前提下，提升正文的准确性和文学表达。' },
];

export function GenerationToolbar({ chapterId, sourceRevisionId, dirty, preview, pending, onPreview, onStart }: {
  chapterId: string;
  sourceRevisionId?: string;
  dirty: boolean;
  preview?: ContextPreview;
  pending: boolean;
  onPreview: (task: GenerationTaskInput) => void;
  onStart: (task: GenerationTaskInput) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<WritingTaskKind>('chapter-draft');
  const [instruction, setInstruction] = useState(actions[0].instruction);
  const [candidateCount, setCandidateCount] = useState(2);
  const task: GenerationTaskInput = {
    kind,
    target: { kind: 'chapter', id: chapterId },
    instruction,
    candidateCount,
    requestedOutputTokens: 8192,
    contextWindow: 128_000,
    sourceRevisionId,
  };
  function choose(next: WritingTaskKind) {
    setKind(next);
    setInstruction(actions.find((action) => action.kind === next)?.instruction ?? '');
    setExpanded(true);
  }

  return <section className="generation-toolbar">
    <div className="generation-actions">{actions.map((action) => <button className={kind === action.kind && expanded ? 'quiet-button selected' : 'quiet-button'} type="button" key={action.kind} onClick={() => choose(action.kind)}>{action.label}</button>)}</div>
    {expanded && <div className="generation-config">
      <label>写作要求<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
      <label>候选数量<select value={candidateCount} onChange={(event) => setCandidateCount(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
      {dirty && <p className="form-error">请先保存当前修改，确保 AI 使用的是明确的正式稿版本。</p>}
      <div className="inline-actions"><button className="quiet-button" type="button" disabled={pending || dirty || !instruction.trim()} onClick={() => onPreview(task)}>预览上下文</button><button className="primary-action" type="button" disabled={pending || dirty || !instruction.trim()} onClick={() => onStart(task)}>{pending ? '启动中…' : '开始生成'}</button></div>
      {preview && <ContextPreviewPanel preview={preview} />}
    </div>}
  </section>;
}
