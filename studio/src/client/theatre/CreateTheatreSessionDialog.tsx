import { useState } from 'react';
import type { TheatreSession } from '../api/client';

export function CreateTheatreSessionDialog({ characters, pending, onClose, onCreate }: {
  characters: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; participantIds: string[]; opening: { role: 'system'; content: string }; userPersona: string; narratorMode: TheatreSession['narratorMode'] }) => void;
}) {
  const [title, setTitle] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [userPersona, setUserPersona] = useState('');
  const [opening, setOpening] = useState('');
  const [narratorMode, setNarratorMode] = useState<TheatreSession['narratorMode']>('light');
  return <div className="dialog-backdrop"><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="create-theatre-title"><div className="dialog-heading"><div><p className="section-kicker">NEW THEATRE SESSION</p><h2 id="create-theatre-title">新建剧场会话</h2></div><button className="quiet-button" type="button" onClick={onClose}>关闭</button></div>
    <form onSubmit={(event) => { event.preventDefault(); onCreate({ title, participantIds, opening: { role: 'system', content: opening }, userPersona, narratorMode }); }}>
      <label>会话名称<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <fieldset><legend>参与角色</legend>{characters.map((character) => <label className="checkbox-label" key={character.id}><input aria-label={`参与角色 ${character.name}`} type="checkbox" checked={participantIds.includes(character.id)} onChange={(event) => setParticipantIds(event.target.checked ? [...participantIds, character.id] : participantIds.filter((id) => id !== character.id))} />{character.name}</label>)}</fieldset>
      <label>用户身份<textarea required value={userPersona} onChange={(event) => setUserPersona(event.target.value)} /></label>
      <label>旁白模式<select value={narratorMode} onChange={(event) => setNarratorMode(event.target.value as TheatreSession['narratorMode'])}><option value="none">无旁白</option><option value="light">轻旁白</option><option value="cinematic">电影化</option><option value="omniscient">全知</option></select></label>
      <label>开场场景<textarea required value={opening} onChange={(event) => setOpening(event.target.value)} /></label>
      {!characters.length && <p className="form-error">请先在设定库创建至少一个角色。</p>}
      <div className="dialog-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className="primary-action" type="submit" disabled={pending || !participantIds.length}>{pending ? '创建中…' : '创建会话'}</button></div>
    </form>
  </section></div>;
}
