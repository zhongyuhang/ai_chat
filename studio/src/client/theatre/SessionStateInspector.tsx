import { useState } from 'react';
import type { TheatreSession } from '../api/client';

export function SessionStateInspector({ session, pending, onPin }: { session: TheatreSession; pending: boolean; onPin: (memory: string) => void }) {
  const [memory, setMemory] = useState('');
  return <aside className="theatre-inspector"><section className="rail-card"><p className="section-kicker">SESSION STATE</p><h3>会话状态</h3><dl><div><dt>用户身份</dt><dd>{session.userPersona}</dd></div><div><dt>旁白</dt><dd>{session.narratorMode}</dd></div></dl></section><section className="rail-card"><p className="section-kicker">PINNED MEMORY</p><h3>固定记忆</h3><ul>{session.pinnedMemory.map((item) => <li key={item}>{item}</li>)}</ul><label>固定记忆<input value={memory} onChange={(event) => setMemory(event.target.value)} /></label><button className="quiet-button" type="button" disabled={pending || !memory.trim()} onClick={() => { onPin(memory); setMemory(''); }}>固定记忆</button></section></aside>;
}
