import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type TheatreSession } from '../api/client';
import { CandidateComparison } from '../studio/CandidateComparison';
import { BranchNavigator, activePath } from './BranchNavigator';
import { CreateTheatreSessionDialog } from './CreateTheatreSessionDialog';
import { TheatreComposer } from './TheatreComposer';
import { SessionStateInspector } from './SessionStateInspector';

export function CharacterTheatre({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['theatre-sessions', projectId], queryFn: () => api.listTheatreSessions(projectId) });
  const canon = useQuery({ queryKey: ['canon', projectId], queryFn: () => api.getCanon(projectId) });
  const [sessionId, setSessionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState('');
  const [ooc, setOoc] = useState('');
  const [candidateCount, setCandidateCount] = useState(2);
  const [runId, setRunId] = useState('');
  const [replyParentId, setReplyParentId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [material, setMaterial] = useState<{ sceneCard: { title: string; beats: string[] } }>();

  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId(sessions.data[0].id);
  }, [sessionId, sessions.data]);
  const session = useQuery({ queryKey: ['theatre-session', projectId, sessionId], queryFn: () => api.getTheatreSession(projectId, sessionId), enabled: Boolean(sessionId) });
  const run = useQuery({
    queryKey: ['generation-run', runId],
    queryFn: () => api.getGenerationRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => query.state.data && ['completed', 'failed', 'interrupted', 'cancelled'].includes(query.state.data.status) ? false : 350,
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createTheatreSession>[1]) => api.createTheatreSession(projectId, input),
    onSuccess: async (created) => {
      setSessionId(created.id);
      queryClient.setQueryData(['theatre-session', projectId, created.id], created);
      await queryClient.invalidateQueries({ queryKey: ['theatre-sessions', projectId] });
      setCreating(false);
    },
  });
  const selectBranch = useMutation({
    mutationFn: ({ parentId, childId }: { parentId: string; childId: string }) => api.selectTheatreBranch(projectId, sessionId, parentId, childId),
    onSuccess: (updated) => queryClient.setQueryData(['theatre-session', projectId, sessionId], updated),
  });
  const pin = useMutation({
    mutationFn: (memory: string) => api.pinTheatreMemory(projectId, sessionId, memory),
    onSuccess: (updated) => queryClient.setQueryData(['theatre-session', projectId, sessionId], updated),
  });

  async function startReply(parentId: string, instruction: string) {
    setPending(true);
    setError('');
    try {
      const created = await api.startGeneration(projectId, {
        kind: 'theatre-reply',
        target: { kind: 'theatre-session', id: sessionId },
        instruction,
        candidateCount,
        requestedOutputTokens: 4096,
        contextWindow: 128_000,
      });
      setReplyParentId(parentId);
      setRunId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成回复失败。');
    } finally {
      setPending(false);
    }
  }

  async function send() {
    if (!session.data || !content.trim()) return;
    setPending(true);
    setError('');
    try {
      const updated = await api.appendTheatreMessage(projectId, sessionId, session.data.graph.activeLeafId, { role: 'user', content: content.trim() });
      queryClient.setQueryData(['theatre-session', projectId, sessionId], updated);
      const instruction = `请以参与角色身份回应用户的新消息。\n用户消息：${content.trim()}${ooc.trim() ? `\nOOC 指令：${ooc.trim()}` : ''}`;
      setContent('');
      await startReply(updated.graph.activeLeafId, instruction);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败。');
      setPending(false);
    }
  }

  async function accept(candidateId: string) {
    setPending(true);
    try {
      const updated = await api.acceptTheatreCandidate(projectId, sessionId, runId, candidateId, replyParentId);
      queryClient.setQueryData(['theatre-session', projectId, sessionId], updated);
      await queryClient.invalidateQueries({ queryKey: ['theatre-sessions', projectId] });
      setRunId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采用回复失败。');
    } finally {
      setPending(false);
    }
  }

  async function convertBranch(current: TheatreSession) {
    try {
      setMaterial(await api.convertTheatreBranch(projectId, current.id, current.graph.activeLeafId, current.title));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '素材转换失败。');
    }
  }

  const path = session.data ? activePath(session.data) : [];
  const latestAssistant = [...path].reverse().find((node) => node.role === 'assistant');

  return <main className="main-content theatre-workspace" id="main-content">
    <header className="workspace-heading theatre-heading"><div><p className="section-kicker">CHARACTER THEATRE</p><h2>角色剧场</h2><p>试演分支与正式设定隔离；只有明确转换和确认后，素材才进入小说工作流。</p></div><div className="inline-actions"><button className="quiet-button" type="button" onClick={onBack}>返回项目中心</button><button className="primary-action" type="button" onClick={() => setCreating(true)}>新建剧场会话</button></div></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="theatre-session-tabs" role="tablist" aria-label="剧场会话">{sessions.data?.map((item) => <button role="tab" aria-selected={item.id === sessionId} type="button" key={item.id} onClick={() => setSessionId(item.id)}>{item.title}</button>)}</div>
    {!sessions.isLoading && !sessions.data?.length && <section className="theatre-empty"><h3>还没有试演会话</h3><p>从已确认角色创建一次对话试演，所有重试都会保留为分支。</p><button className="primary-action" type="button" onClick={() => setCreating(true)}>新建剧场会话</button></section>}
    {session.data && <div className="theatre-layout"><section className="theatre-stage"><div className="theatre-scene-intro">{path.filter((node) => node.role === 'system').map((node) => <p key={node.id}>{node.content}</p>)}</div><div className="message-list">{path.filter((node) => node.role !== 'system').map((node) => <article className={`theatre-message ${node.role}`} key={node.id}><span>{node.role === 'user' ? session.data.userPersona || '用户' : '角色'}</span><p>{node.content}</p>{node.role === 'assistant' && node.id === latestAssistant?.id && <button className="message-action" type="button" disabled={pending || Boolean(runId)} onClick={() => node.parentId && startReply(node.parentId, '请基于同一条用户消息生成一个不同但仍符合角色设定的回复。')}>重试此回复</button>}<BranchNavigator session={session.data} parentId={node.id} onSelect={(childId) => selectBranch.mutate({ parentId: node.id, childId })} /></article>)}</div>
      {run.data && <CandidateComparison run={run.data} accepting={pending} onAccept={(candidateId) => void accept(candidateId)} onCancel={() => api.cancelGeneration(runId).then(() => run.refetch())} />}
      <TheatreComposer content={content} ooc={ooc} candidateCount={candidateCount} pending={pending || Boolean(runId)} onContent={setContent} onOoc={setOoc} onCandidateCount={setCandidateCount} onSend={() => void send()} />
      <div className="material-actions"><button className="quiet-button" type="button" onClick={() => void convertBranch(session.data)}>转为场景卡</button></div>
      {material && <section className="material-preview"><p className="section-kicker">MATERIAL PREVIEW</p><h3>场景卡预览</h3><h4>{material.sceneCard.title}</h4>{material.sceneCard.beats.map((beat, index) => <p key={`${beat}-${index}`}>{beat}</p>)}</section>}
      </section><SessionStateInspector session={session.data} pending={pin.isPending} onPin={(memory) => pin.mutate(memory)} /></div>}
    {creating && <CreateTheatreSessionDialog characters={canon.data?.characters ?? []} pending={create.isPending} onClose={() => setCreating(false)} onCreate={(input) => create.mutate(input)} />}
  </main>;
}
