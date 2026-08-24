import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { CreateProjectDialog, type CreateProjectInput } from './CreateProjectDialog';
import { LegacyMigrationDialog } from '../migration/LegacyMigrationDialog';

const modeLabel = { serial: '连载优先', publication: '出版优先', both: '连载 + 出版' };
const statusLabel = { draft: '规划中', active: '创作中', archived: '已归档', completed: '已完成' };

export function ProjectCenter({ onOpenCanon, onOpenStudio }: { onOpenCanon: (projectId: string) => void; onOpenStudio: (projectId: string) => void }) {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!selectedId && projects.data?.length) setSelectedId(projects.data[0].id);
  }, [projects.data, selectedId]);
  const selected = projects.data?.find((project) => project.id === selectedId);

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedId(project.id);
      setCreating(false);
    },
  });
  const archive = useMutation({
    mutationFn: api.archiveProject,
    onSuccess: async (project) => {
      queryClient.setQueryData(['projects'], (items: typeof projects.data) => items?.map((item) => item.id === project.id ? project : item));
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  async function createProject(input: CreateProjectInput) {
    await create.mutateAsync(input);
  }

  return (
    <main className="main-content project-center" id="main-content">
      <section className="project-toolbar">
        <div><p className="section-kicker">PROJECT CENTER</p><h2>项目中心</h2><p>作品正文与设定存放在本地磁盘，刷新或关闭浏览器后仍可恢复。</p></div>
        <button className="primary-action" type="button" onClick={() => setCreating(true)}>新建小说</button>
      </section>

      {projects.isLoading && <p className="loading-state" role="status">正在读取本地项目…</p>}
      {projects.isError && <p className="form-error" role="alert">{projects.error.message}</p>}

      <div className="project-layout">
        <section className="project-list" aria-label="小说项目列表">
          {projects.data?.map((project) => (
            <button className={project.id === selectedId ? 'project-row selected' : 'project-row'} type="button" onClick={() => setSelectedId(project.id)} key={project.id}>
              <span><strong>{project.title}</strong><small>{modeLabel[project.writingMode]} · {statusLabel[project.status]}</small></span>
              <time>{new Date(project.updatedAt).toLocaleDateString('zh-CN')}</time>
            </button>
          ))}
          {!projects.isLoading && !projects.data?.length && <div className="empty-projects"><strong>还没有小说项目</strong><p>创建第一部作品，系统会建立可修订的本地目录。</p></div>}
        </section>

        <section className="project-detail" aria-live="polite">
          {selected ? <>
            <div className="detail-heading"><span className={`status-pill ${selected.status}`}>{statusLabel[selected.status]}</span><h2>{selected.title}</h2></div>
            <p>{selected.synopsis || '暂未填写作品简介。'}</p>
            <dl>
              <div><dt>目标</dt><dd>目标 {(selected.targetCharacters / 10_000).toFixed(1)} 万字</dd></div>
              <div><dt>模式</dt><dd>{modeLabel[selected.writingMode]}</dd></div>
              <div><dt>内容分级</dt><dd>{selected.contentRating}</dd></div>
            </dl>
            <div className="detail-actions">
              <button className="primary-action" type="button" onClick={() => onOpenStudio(selected.id)}>进入小说工坊</button>
              <button className="quiet-button" type="button" onClick={() => onOpenCanon(selected.id)}>设定库</button>
              {selected.status !== 'archived' && <button className="quiet-button danger-button" type="button" onClick={() => window.confirm('归档后项目仍会保留，可在后续版本恢复。确认归档吗？') && archive.mutate(selected.id)} disabled={archive.isPending}>归档项目</button>}
            </div>
          </> : <div className="detail-placeholder">选择一个项目查看详情。</div>}
        </section>
      </div>

      <LegacyMigrationDialog onImported={() => queryClient.invalidateQueries({ queryKey: ['projects'] })} />
      {creating && <CreateProjectDialog onClose={() => setCreating(false)} onCreate={createProject} pending={create.isPending} />}
    </main>
  );
}
