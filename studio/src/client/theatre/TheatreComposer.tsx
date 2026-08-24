export function TheatreComposer({ content, ooc, candidateCount, pending, onContent, onOoc, onCandidateCount, onSend }: {
  content: string;
  ooc: string;
  candidateCount: number;
  pending: boolean;
  onContent: (value: string) => void;
  onOoc: (value: string) => void;
  onCandidateCount: (value: number) => void;
  onSend: () => void;
}) {
  return <section className="theatre-composer"><label>对话内容<textarea value={content} onChange={(event) => onContent(event.target.value)} /></label><div className="composer-options"><label>OOC 指令<input value={ooc} onChange={(event) => onOoc(event.target.value)} /></label><label>回复候选数量<select value={candidateCount} onChange={(event) => onCandidateCount(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label></div><button className="primary-action" type="button" disabled={pending || !content.trim()} onClick={onSend}>{pending ? '正在生成…' : '发送并生成回复'}</button></section>;
}
