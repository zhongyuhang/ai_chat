import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const dashboard = useQuery({ queryKey: ['dashboard', projectId], queryFn: () => api.getProjectDashboard(projectId) });
  if (dashboard.isLoading) return <p className="loading-state">正在统计正式稿…</p>;
  if (dashboard.isError) return <p className="form-error">{dashboard.error.message}</p>;
  const data = dashboard.data!;
  return <section className="project-dashboard" aria-label="作品进度"><div><span>正式稿</span><strong>已采用 {data.acceptedChapterCount} / {data.plannedChapterCount} 章</strong></div><div><span>正文字符</span><strong>{data.acceptedCharacters.toLocaleString('zh-CN')}</strong></div><div><span>连续性资产</span><strong>{data.characterCount} 角色 · {data.relationshipCount} 关系</strong></div><div><span>未回收伏笔</span><strong>{data.unresolvedForeshadowing}</strong></div></section>;
}
