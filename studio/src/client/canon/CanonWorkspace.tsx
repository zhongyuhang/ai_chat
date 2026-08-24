import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const entityId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
type Tab = 'characters' | 'relationships' | 'worldbook' | 'timeline' | 'foreshadowing' | 'outline';
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'characters', label: '角色' }, { id: 'relationships', label: '人物关系' }, { id: 'worldbook', label: '世界书' },
  { id: 'timeline', label: '时间线' }, { id: 'foreshadowing', label: '伏笔' }, { id: 'outline', label: '全书规划' },
];

export function CanonWorkspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('characters');
  const [form, setForm] = useState<string>();
  const [previewText, setPreviewText] = useState('');
  const [hits, setHits] = useState<Array<{ matchedTerm?: string; reason: string; entry: { id: string; name: string } }>>([]);
  const canon = useQuery({ queryKey: ['canon', projectId], queryFn: () => api.getCanon(projectId) });
  const outline = useQuery({ queryKey: ['outline', projectId], queryFn: () => api.getOutline(projectId) });
  const refreshCanon = () => queryClient.invalidateQueries({ queryKey: ['canon', projectId] });
  const refreshOutline = () => queryClient.invalidateQueries({ queryKey: ['outline', projectId] });
  const save = useMutation({ mutationFn: async ({ kind, id, value }: { kind: 'character' | 'relationship' | 'worldbook' | 'timeline' | 'foreshadowing'; id: string; value: unknown }) => {
    if (kind === 'character') return api.saveCharacter(projectId, id, value);
    if (kind === 'relationship') return api.saveRelationship(projectId, id, value);
    if (kind === 'worldbook') return api.saveWorldBook(projectId, id, value);
    if (kind === 'timeline') return api.saveTimelineEvent(projectId, id, value);
    return api.saveForeshadowing(projectId, id, value);
  }, onSuccess: async () => { await refreshCanon(); setForm(undefined); } });
  const savePlan = useMutation({ mutationFn: async ({ kind, id, volumeId, value }: { kind: 'story' | 'volume' | 'chapter'; id?: string; volumeId?: string; value: unknown }) => {
    if (kind === 'story') return api.saveStoryBible(projectId, value);
    if (kind === 'volume') return api.saveVolume(projectId, id!, value);
    return api.saveChapterOutline(projectId, volumeId!, id!, value);
  }, onSuccess: async () => { await refreshOutline(); setForm(undefined); } });

  function data(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
  async function submitCharacter(event: FormEvent<HTMLFormElement>) {
    const values = data(event); const now = new Date().toISOString();
    const speech = String(values.get('speech') || '').trim();
    await save.mutateAsync({ kind: 'character', id: entityId('character'), value: { schemaVersion: 1, name: values.get('name'), goals: [values.get('goal')], speechPatterns: speech ? [speech] : [], currentState: { physical: values.get('physical') || '', emotional: values.get('emotional') || '', relational: '', knowledge: '' }, createdAt: now, updatedAt: now } });
  }
  async function submitRelationship(event: FormEvent<HTMLFormElement>) {
    const values = data(event); const now = new Date().toISOString();
    await save.mutateAsync({ kind: 'relationship', id: entityId('relationship'), value: { schemaVersion: 1, fromCharacterId: values.get('from'), toCharacterId: values.get('to'), publicRelationship: values.get('public'), privateFeelings: values.get('private'), conflict: values.get('conflict'), trust: 0, createdAt: now, updatedAt: now } });
  }
  async function submitWorld(event: FormEvent<HTMLFormElement>) {
    const values = data(event); const now = new Date().toISOString();
    await save.mutateAsync({ kind: 'worldbook', id: entityId('worldbook'), value: { schemaVersion: 1, name: values.get('name'), category: 'setting', content: values.get('content'), scope: { type: 'global' }, activation: { type: 'keyword', keywords: [values.get('keyword')], synonyms: [] }, priority: 50, enabled: true, status: 'confirmed', createdAt: now, updatedAt: now } });
  }
  async function submitTimeline(event: FormEvent<HTMLFormElement>) {
    const values = data(event); const now = new Date().toISOString();
    await save.mutateAsync({ kind: 'timeline', id: entityId('event'), value: { schemaVersion: 1, title: values.get('title'), inWorldTime: values.get('time'), sourceId: 'manual_canon', createdAt: now, updatedAt: now } });
  }
  async function submitForeshadowing(event: FormEvent<HTMLFormElement>) {
    const values = data(event); const now = new Date().toISOString();
    await save.mutateAsync({ kind: 'foreshadowing', id: entityId('foreshadowing'), value: { schemaVersion: 1, setup: values.get('setup'), intendedPayoff: values.get('payoff'), status: 'planned', setupSourceId: 'manual_canon', createdAt: now, updatedAt: now } });
  }
  async function submitStory(event: FormEvent<HTMLFormElement>) {
    const values = data(event); await savePlan.mutateAsync({ kind: 'story', value: { premise: values.get('premise'), style: values.get('style'), coreConflict: values.get('conflict'), endingContract: values.get('ending'), setting: values.get('setting') } });
  }
  async function submitVolume(event: FormEvent<HTMLFormElement>) {
    const values = data(event); await savePlan.mutateAsync({ kind: 'volume', id: entityId('volume'), value: { title: values.get('title'), goal: values.get('goal') } });
  }
  async function submitChapter(event: FormEvent<HTMLFormElement>) {
    const values = data(event); await savePlan.mutateAsync({ kind: 'chapter', id: entityId('chapter'), volumeId: String(values.get('volume')), value: { title: values.get('title'), purpose: values.get('purpose'), endingHook: values.get('hook') } });
  }

  const characterName = (id: string) => canon.data?.characters.find((item) => item.id === id)?.name ?? id;
  return <main className="main-content canon-workspace" id="main-content">
    <div className="workspace-heading"><div><p className="section-kicker">CONFIRMED CANON</p><h2>设定库</h2><p>只有手动保存或明确采用的提案才会进入正式设定。</p></div><button className="quiet-button" type="button" onClick={onBack}>返回项目中心</button></div>
    <div className="tabs" role="tablist" aria-label="设定类型">{tabs.map((item) => <button role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => { setTab(item.id); setForm(undefined); }}>{item.label}</button>)}</div>

    {tab === 'characters' && <section className="canon-panel"><div className="panel-heading"><h3>角色卡</h3><button className="primary-action" type="button" onClick={() => setForm('character')}>新建角色</button></div>
      {form === 'character' && <form className="canon-form" onSubmit={submitCharacter}><label>姓名<input name="name" required /></label><label>核心目标<input name="goal" required /></label><label>说话习惯<input name="speech" /></label><label>当前身体状态<input name="physical" /></label><label>当前情绪<input name="emotional" /></label><button className="primary-action" type="submit">保存角色</button></form>}
      <div className="canon-grid">{canon.data?.characters.map((character) => <article key={character.id}><h4>{character.name}</h4><p>{character.goals.join('、') || '暂无目标'}</p><small>{character.speechPatterns.join('；')} · {character.currentState.physical}</small></article>)}</div></section>}

    {tab === 'relationships' && <section className="canon-panel"><div className="panel-heading"><h3>人物关系网</h3><button className="primary-action" type="button" onClick={() => setForm('relationship')}>新建人物关系</button></div>
      {form === 'relationship' && <form className="canon-form" onSubmit={submitRelationship}><label>关系起点<select name="from" required>{canon.data?.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>关系终点<select name="to" required defaultValue={canon.data?.characters[1]?.id}>{canon.data?.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>公开关系<input name="public" /></label><label>真实情感<textarea name="private" required /></label><label>核心冲突<textarea name="conflict" /></label><button className="primary-action" type="submit">保存人物关系</button></form>}
      <div className="canon-grid">{canon.data?.relationships.map((item) => <article key={item.id}><h4>{characterName(item.fromCharacterId)} → {characterName(item.toCharacterId)}</h4><p>{item.privateFeelings}</p><small>{item.publicRelationship} · {item.conflict}</small></article>)}</div></section>}

    {tab === 'worldbook' && <section className="canon-panel"><div className="panel-heading"><h3>世界书</h3><button className="primary-action" type="button" onClick={() => setForm('world')}>新建世界书条目</button></div>
      {form === 'world' && <form className="canon-form" onSubmit={submitWorld}><label>条目名称<input name="name" required /></label><label>触发关键词<input name="keyword" required /></label><label>设定内容<textarea name="content" required /></label><button className="primary-action" type="submit">保存世界书</button></form>}
      <div className="preview-box"><label>触发预览文本<textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} /></label><button className="quiet-button" type="button" onClick={async () => setHits((await api.previewWorldBook(projectId, previewText)).hits)}>预览命中</button>{hits.map((hit) => <div className="hit-result" key={hit.entry.id}><strong>命中：{hit.matchedTerm || hit.entry.name}</strong><span>原因：{hit.reason}</span></div>)}</div><div className="canon-grid">{canon.data?.worldBook.map((entry) => <article key={entry.id}><h4>{entry.name}</h4><p>{entry.content}</p></article>)}</div></section>}

    {tab === 'timeline' && <section className="canon-panel"><div className="panel-heading"><h3>时间线</h3><button className="primary-action" type="button" onClick={() => setForm('timeline')}>新建时间线事件</button></div>{form === 'timeline' && <form className="canon-form" onSubmit={submitTimeline}><label>事件名称<input name="title" required /></label><label>故事内时间<input name="time" required /></label><button className="primary-action" type="submit">保存时间线事件</button></form>}<div className="canon-grid">{canon.data?.timeline.map((item) => <article key={item.id}><h4>{item.title}</h4><p>{item.inWorldTime}</p></article>)}</div></section>}

    {tab === 'foreshadowing' && <section className="canon-panel"><div className="panel-heading"><h3>伏笔台账</h3><button className="primary-action" type="button" onClick={() => setForm('foreshadowing')}>新建伏笔</button></div>{form === 'foreshadowing' && <form className="canon-form" onSubmit={submitForeshadowing}><label>埋设内容<textarea name="setup" required /></label><label>预期回收<textarea name="payoff" required /></label><button className="primary-action" type="submit">保存伏笔</button></form>}<div className="canon-grid">{canon.data?.foreshadowing.map((item) => <article key={item.id}><h4>{item.status}</h4><p>{item.setup}</p><small>回收：{item.intendedPayoff}</small></article>)}</div></section>}

    {tab === 'outline' && <section className="canon-panel outline-panel"><div className="panel-heading"><h3>全书规划树</h3><div className="inline-actions"><button className="quiet-button" type="button" onClick={() => setForm('volume')}>新增卷</button>{Boolean(outline.data?.volumes.length) && <button className="primary-action" type="button" onClick={() => setForm('chapter')}>新增章纲</button>}</div></div>
      <form className="canon-form story-bible-form" key={outline.data?.updatedAt} onSubmit={submitStory}><label>故事前提<textarea name="premise" defaultValue={outline.data?.premise} /></label><label>文风约束<textarea name="style" defaultValue={outline.data?.style} /></label><label>核心冲突<textarea name="conflict" defaultValue={outline.data?.coreConflict} /></label><label>结局契约<textarea name="ending" defaultValue={outline.data?.endingContract} /></label><label>世界背景<textarea name="setting" defaultValue={outline.data?.setting} /></label><button className="quiet-button" type="submit">保存全书契约</button></form>
      {form === 'volume' && <form className="canon-form" onSubmit={submitVolume}><label>卷名<input name="title" required /></label><label>卷目标<textarea name="goal" required /></label><button className="primary-action" type="submit">保存卷</button></form>}
      {form === 'chapter' && <form className="canon-form" onSubmit={submitChapter}><label>所属卷<select name="volume">{outline.data?.volumes.map((volume) => <option value={volume.id} key={volume.id}>{volume.title}</option>)}</select></label><label>章纲标题<input name="title" required /></label><label>本章目的<textarea name="purpose" required /></label><label>结尾钩子<textarea name="hook" /></label><button className="primary-action" type="submit">保存章纲</button></form>}
      <div className="outline-tree">{outline.data?.volumes.map((volume) => <article key={volume.id}><h4>{volume.title}</h4><p>{volume.goal}</p><ol>{volume.chapters.map((chapter) => <li key={chapter.id}><strong>{chapter.title}</strong><span>{chapter.purpose}</span><small>{chapter.endingHook}</small></li>)}</ol></article>)}</div>
    </section>}
  </main>;
}
