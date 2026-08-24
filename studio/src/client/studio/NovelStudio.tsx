import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import { api } from '../api/client';
import { clearDraft, readDraft, writeDraft } from './draft-journal';

const DEFAULT_CHAPTER = 'chapter_001';

export function NovelStudio({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [chapterId, setChapterId] = useState(DEFAULT_CHAPTER);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const hydratedKey = useRef('');
  const chapter = useQuery({ queryKey: ['chapter', projectId, chapterId], queryFn: () => api.getChapter(projectId, chapterId), retry: false });
  const revisions = useQuery({ queryKey: ['chapter-revisions', projectId, chapterId], queryFn: () => api.listChapterRevisions(projectId, chapterId) });

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
          onChange={(value) => { setContent(value); setDirty(true); setNotice(''); }}
        />}
      </section>

      <aside className="studio-rail">
        <section className="rail-card"><p className="section-kicker">AI CANDIDATE</p><h3>候选区</h3><p>AI 生成内容将在这里预览，不会直接覆盖正式稿。</p><button className="quiet-button" type="button" disabled>生成续写（下一步接入）</button></section>
        <section className="rail-card revision-card"><div className="panel-heading"><div><p className="section-kicker">REVISION HISTORY</p><h3>修订历史</h3></div><span>{revisions.data?.length ?? 0}</span></div>
          {revisions.isLoading && <p className="loading-state">读取修订…</p>}
          <ol>{[...(revisions.data ?? [])].reverse().map((revision) => <li key={revision.id}><div><strong>{revision.reason}</strong><time>{new Date(revision.createdAt).toLocaleString('zh-CN')}</time><small>{revision.characterCount.toLocaleString('zh-CN')} 字符</small></div><button className="quiet-button" type="button" disabled={restore.isPending} onClick={() => window.confirm('恢复会生成一个新修订，不会删除当前历史。继续吗？') && restore.mutate(revision.id)}>恢复</button></li>)}</ol>
          {!revisions.isLoading && !revisions.data?.length && <p className="empty-note">首次保存后，这里会出现可恢复的版本。</p>}
        </section>
      </aside>
    </div>
  </main>;
}
