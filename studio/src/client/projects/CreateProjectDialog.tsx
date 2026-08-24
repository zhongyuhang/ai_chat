import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type Project } from '../api/client';

export interface CreateProjectInput {
  title: string;
  writingMode: Project['writingMode'];
  targetCharacters: number;
}

export function CreateProjectDialog({
  onClose,
  onCreate,
  pending,
}: {
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
  pending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [writingMode, setWritingMode] = useState<Project['writingMode']>('both');
  const [targetCharacters, setTargetCharacters] = useState(1_000_000);
  const [error, setError] = useState<ApiError | Error | null>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, pending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onCreate({ title, writingMode, targetCharacters });
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error('创建失败。'));
    }
  }

  const fields = error instanceof ApiError ? error.fields : {};
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div className="dialog-heading">
          <div><p className="section-kicker">NEW STORY</p><h2 id="create-project-title">新建小说</h2></div>
          <button className="quiet-button" type="button" onClick={onClose} aria-label="关闭新建小说窗口">关闭</button>
        </div>
        <form onSubmit={submit}>
          <label>作品名称
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
          </label>
          {fields.title && <p className="field-error">{fields.title}</p>}
          <label>写作模式
            <select value={writingMode} onChange={(event) => setWritingMode(event.target.value as Project['writingMode'])}>
              <option value="both">连载 + 出版</option>
              <option value="serial">连载优先</option>
              <option value="publication">出版优先</option>
            </select>
          </label>
          <label>目标字数
            <input type="number" min={1000} max={20_000_000} step={1000} value={targetCharacters} onChange={(event) => setTargetCharacters(Number(event.target.value))} />
          </label>
          {error && <p className="form-error" role="alert">{error.message}</p>}
          <div className="dialog-actions">
            <button className="quiet-button" type="button" onClick={onClose}>取消</button>
            <button className="primary-action" type="submit" disabled={pending}>{pending ? '正在创建…' : '创建项目'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
