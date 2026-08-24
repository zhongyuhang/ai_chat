import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const entityId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;

export function CanonWorkspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'characters' | 'worldbook'>('characters');
  const [characterForm, setCharacterForm] = useState(false);
  const [worldForm, setWorldForm] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [hits, setHits] = useState<Array<{ matchedTerm?: string; reason: string; entry: { id: string; name: string } }>>([]);
  const canon = useQuery({ queryKey: ['canon', projectId], queryFn: () => api.getCanon(projectId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['canon', projectId] });
  const saveCharacter = useMutation({ mutationFn: ({ id, value }: { id: string; value: unknown }) => api.saveCharacter(projectId, id, value), onSuccess: refresh });
  const saveWorld = useMutation({ mutationFn: ({ id, value }: { id: string; value: unknown }) => api.saveWorldBook(projectId, id, value), onSuccess: refresh });

  async function submitCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    await saveCharacter.mutateAsync({ id: entityId('character'), value: { schemaVersion: 1, name: data.get('name'), goals: [data.get('goal')], createdAt: now, updatedAt: now } });
    setCharacterForm(false);
  }
  async function submitWorld(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    await saveWorld.mutateAsync({ id: entityId('worldbook'), value: { schemaVersion: 1, name: data.get('name'), category: 'setting', content: data.get('content'), scope: { type: 'global' }, activation: { type: 'keyword', keywords: [data.get('keyword')], synonyms: [] }, priority: 50, enabled: true, status: 'confirmed', createdAt: now, updatedAt: now } });
    setWorldForm(false);
  }
  async function preview() {
    setHits((await api.previewWorldBook(projectId, previewText)).hits);
  }

  return <main className="main-content canon-workspace" id="main-content">
    <div className="workspace-heading"><div><p className="section-kicker">CONFIRMED CANON</p><h2>设定库</h2><p>只有手动保存或明确采用的提案才会进入正式设定。</p></div><button className="quiet-button" type="button" onClick={onBack}>返回项目中心</button></div>
    <div className="tabs" role="tablist" aria-label="设定类型"><button role="tab" aria-selected={tab === 'characters'} onClick={() => setTab('characters')}>角色</button><button role="tab" aria-selected={tab === 'worldbook'} onClick={() => setTab('worldbook')}>世界书</button></div>
    {tab === 'characters' && <section className="canon-panel"><div className="panel-heading"><h3>角色卡</h3><button className="primary-action" type="button" onClick={() => setCharacterForm(true)}>新建角色</button></div>
      {characterForm && <form className="canon-form" onSubmit={submitCharacter}><label>姓名<input name="name" required /></label><label>核心目标<input name="goal" required /></label><div className="inline-actions"><button className="quiet-button" type="button" onClick={() => setCharacterForm(false)}>取消</button><button className="primary-action" type="submit" disabled={saveCharacter.isPending}>保存角色</button></div></form>}
      <div className="canon-grid">{canon.data?.characters.map((character) => <article key={character.id}><h4>{character.name}</h4><p>{character.goals.join('、') || '暂无目标'}</p></article>)}</div></section>}
    {tab === 'worldbook' && <section className="canon-panel"><div className="panel-heading"><h3>世界书</h3><button className="primary-action" type="button" onClick={() => setWorldForm(true)}>新建世界书条目</button></div>
      {worldForm && <form className="canon-form" onSubmit={submitWorld}><label>条目名称<input name="name" required /></label><label>触发关键词<input name="keyword" required /></label><label>设定内容<textarea name="content" rows={4} required /></label><button className="primary-action" type="submit" disabled={saveWorld.isPending}>保存世界书</button></form>}
      <div className="preview-box"><label>触发预览文本<textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} /></label><button className="quiet-button" type="button" onClick={preview}>预览命中</button>{hits.map((hit) => <div className="hit-result" key={hit.entry.id}><strong>命中：{hit.matchedTerm || hit.entry.name}</strong><span>原因：{hit.reason}</span></div>)}</div>
      <div className="canon-grid">{canon.data?.worldBook.map((entry) => <article key={entry.id}><h4>{entry.name}</h4><p>{entry.content}</p></article>)}</div></section>}
  </main>;
}
