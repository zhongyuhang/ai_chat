import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { api } from '../api/client';
import { clearDraft, readDraft, writeDraft } from './draft-journal';
import { GenerationToolbar } from './GenerationToolbar';
import { CandidateComparison } from './CandidateComparison';
import type { ContextPreview, GenerationTaskInput } from '../api/client';
import type { EditorView as EditorViewType } from '@codemirror/view';
import { QualityPanel } from '../quality/QualityPanel';

const DEFAULT_CHAPTER = 'chapter_001';

export function NovelStudio({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [chapterId, setChapterId] = useState(DEFAULT_CHAPTER);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [contextPreview, setContextPreview] = useState<ContextPreview>();
  const [runId, setRunId] = useState('');
  const hydratedKey = useRef('');
  const editor = useRef<EditorViewType | undefined>(undefined);
  const chapter = useQuery({ queryKey: ['chapter', projectId, chapterId], queryFn: () => api.getChapter(projectId, chapterId), retry: false });
  const revisions = useQuery({ queryKey: ['chapter-revisions', projectId, chapterId], queryFn: () => api.listChapterRevisions(projectId, chapterId) });
  const run = useQuery({
    queryKey: ['generation-run', runId],
    queryFn: () => api.getGenerationRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => query.state.data && ['completed', 'failed', 'interrupted', 'cancelled'].includes(query.state.data.status) ? false : 400,
  });

  useEffect(() => {
    if (!chapter.data || hydratedKey.current === `${projectId}:${chapterId}`) return;
    const key = `${projectId}:${chapterId}`;
    void readDraft(projectId, chapterId).then((draft) => {
      if (hydratedKey.current === key) return;
      const accepted = chapter.data?.content || '# 第一章\n\n';
      if (draft && draft.content !== accepted) {
        setContent(draft.content);
        setDirty(true);
        setNotice('已恢复未保存草稿');
      } else {
        setContent(accepted);
        setDirty(false);
      }
      hydratedKey.current = key;
    });
  }, [chapter.data, chapterId, projectId]);

  useEffect(() => {
    if (!dirty || hydratedKey.current !== `${projectId}:${chapterId}`) return;
    const timer = window.setTimeout(() => void writeDraft(projectId, chapterId, content), 450);
    return () => window.clearTimeout(timer);
  }, [chapterId, content, dirty, projectId]);

  const save = useMutation({
    mutationFn: () => api.saveChapter(projectId, chapterId, content),
    onSuccess: async () => {
      await clearDraft(projectId, chapterId);
      setDirty(false);
      setNotice('已保存为正式稿');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chapter', projectId, chapterId] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-revisions', projectId, chapterId] }),
      ]);
    },
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) => api.restoreChapterRevision(projectId, chapterId, revisionId),
    onSuccess: async () => {
      await clearDraft(projectId, chapterId);
      hydratedKey.current = '';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chapter', projectId, chapterId] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-revisions', projectId, chapterId] }),
      ]);
      setNotice('已恢复历史版本，并生成新的正式修订');
    },
  });
  const previewGeneration = useMutation({
    mutationFn: (task: GenerationTaskInput) => api.previewGeneration(projectId, task),
    onSuccess: setContextPreview,
  });
  const startGeneration = useMutation({
    mutationFn: (task: GenerationTaskInput) => api.startGeneration(projectId, task),
    onSuccess: (created) => { setRunId(created.id); setNotice('AI 生成任务已启动；候选稿不会自动覆盖正式稿。'); },
  });
  const cancelGeneration = useMutation({
    mutationFn: () => api.cancelGeneration(runId),
    onSuccess: () => void run.refetch(),
  });
  const acceptCandidate = useMutation({
    mutationFn: (candidateId: string) => api.acceptGenerationCandidate(runId, candidateId),
    onSuccess: async () => {
      await clearDraft(projectId, chapterId);
      hydratedKey.current = '';
      setDirty(false);
      setNotice('已采用候选稿并保存为正式稿');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chapter', projectId, chapterId] }),
        queryClient.invalidateQueries({ queryKey: ['chapter-revisions', projectId, chapterId] }),
        queryClient.invalidateQueries({ queryKey: ['generation-run', runId] }),
      ]);
    },
  });
  const characterCount = useMemo(() => [...content].filter((character) => !/\s/u.test(character)).length, [content]);

  function openChapter(next: string) {
    const normalized = next.trim();
    if (!/^chapter_[a-zA-Z0-9_-]+$/.test(normalized)) {
      setNotice('章节编号须以 chapter_ 开头，仅含字母、数字、下划线或连字符');
      return;
    }
    hydratedKey.current = '';
    setContent('');
    setDirty(false);
    setNotice('');
    setChapterId(normalized);
  }

  return <main className="main-content studio-workspace" id="main-content">
    <header className="workspace-heading studio-heading">
      <div><p className="section-kicker">NOVEL STUDIO</p><h2>小说工坊</h2><p>正文只在明确保存时进入正式稿；未保存内容由本地草稿日志保护。</p></div>
      <button className="quiet-button" type="button" onClick={onBack}>返回项目中心</button>
    </header>

    <section className="studio-commandbar" aria-label="章节工具栏">
      <label>章节编号<input aria-label="章节编号" defaultValue={chapterId} onKeyDown={(event) => event.key === 'Enter' && openChapter(event.currentTarget.value)} /></label>
      <button className="quiet-button" type="button" onClick={(event) => openChapter((event.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement)?.value || chapterId)}>打开章节</button>
      <span>{characterCount.toLocaleString('zh-CN')} 字符</span>
      <span className={dirty ? 'save-state dirty' : 'save-state'}>{dirty ? '有未保存修改' : '正式稿已同步'}</span>
      <button className="primary-action" type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? '保存中…' : '保存正式稿'}</button>
    </section>

    {(notice || save.isError || chapter.isError) && <p className={save.isError || chapter.isError ? 'form-error studio-notice' : 'studio-notice'} role="status">{save.error?.message || chapter.error?.message || notice}</p>}

    <GenerationToolbar
      chapterId={chapterId}
      dirty={dirty}
      preview={contextPreview}
      pending={previewGeneration.isPending || startGeneration.isPending}
      onPreview={(task) => previewGeneration.mutate(task)}
      onStart={(task) => startGeneration.mutate(task)}
    />
    {(previewGeneration.isError || startGeneration.isError) && <p className="form-error" role="alert">{previewGeneration.error?.message || startGeneration.error?.message}</p>}
    <QualityPanel projectId={projectId} chapterId={chapterId} onNotice={setNotice} onLocate={(issue, report) => {
      const currentRevision = revisions.data?.at(-1)?.id;
      if (!editor.current || currentRevision !== report.revisionId) { setNotice('报告基于旧版本，请重新审校后再定位。'); return; }
      const length = editor.current.state.doc.length;
      const anchor = Math.min(issue.start, length);
      const head = Math.min(issue.end, length);
      editor.current.dispatch({ selection: { anchor, head }, effects: EditorView.scrollIntoView(anchor, { y: 'center' }) });
      editor.current.focus();
    }} />

    <div className="studio-grid">
      <section className="editor-panel" aria-label="章节编辑区">
        <div className="panel-heading"><div><p className="section-kicker">ACCEPTED MANUSCRIPT</p><h3>{chapterId}</h3></div><small>Markdown · UTF-8</small></div>
        {chapter.isLoading ? <p className="loading-state">正在读取章节…</p> : <CodeMirror
          aria-label="章节编辑器"
          className="chapter-editor"
          value={content}
          height="min(64vh, 760px)"
          minHeight="440px"
          extensions={[markdown(), EditorView.contentAttributes.of({ 'aria-label': '章节正文', role: 'textbox' }), EditorView.lineWrapping]}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
          onCreateEditor={(view) => { editor.current = view; }}
          onChange={(value) => { setContent(value); setDirty(true); setNotice(''); }}
        />}
      </section>

      <aside className="studio-rail">
        {run.data ? <CandidateComparison run={run.data} accepting={acceptCandidate.isPending} onAccept={(candidateId) => acceptCandidate.mutate(candidateId)} onCancel={() => cancelGeneration.mutate()} /> : <section className="rail-card"><p className="section-kicker">AI CANDIDATE</p><h3>候选区</h3><p>使用上方写作动作启动 AI。候选稿只在这里预览，明确采用后才会形成正式修订。</p></section>}
        <section className="rail-card revision-card"><div className="panel-heading"><div><p className="section-kicker">REVISION HISTORY</p><h3>修订历史</h3></div><span>{revisions.data?.length ?? 0}</span></div>
          {revisions.isLoading && <p className="loading-state">读取修订…</p>}
          <ol>{[...(revisions.data ?? [])].reverse().map((revision) => <li key={revision.id}><div><strong>{revision.reason}</strong><time>{new Date(revision.createdAt).toLocaleString('zh-CN')}</time><small>{revision.characterCount.toLocaleString('zh-CN')} 字符</small></div><button className="quiet-button" type="button" disabled={restore.isPending} onClick={() => window.confirm('恢复会生成一个新修订，不会删除当前历史。继续吗？') && restore.mutate(revision.id)}>恢复</button></li>)}</ol>
          {!revisions.isLoading && !revisions.data?.length && <p className="empty-note">首次保存后，这里会出现可恢复的版本。</p>}
        </section>
      </aside>
    </div>
  </main>;
}
