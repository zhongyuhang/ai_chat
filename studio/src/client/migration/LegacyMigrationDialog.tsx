import { useState } from 'react';
import { api } from '../api/client';

async function readLegacyExport() {
  const settings = JSON.parse(localStorage.getItem('deepseek_writer_settings_v4') || '{}');
  const databases = await indexedDB.databases?.() ?? [];
  if (!databases.some((database) => database.name === 'deepseek_writer_chat_db')) return { settings, sessions: [] };
  const sessions = await new Promise<unknown[]>((resolve, reject) => {
    const open = indexedDB.open('deepseek_writer_chat_db', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
  return { settings, sessions };
}

export function LegacyMigrationDialog({ onImported }: { onImported: () => void }) {
  const [payload, setPayload] = useState<unknown>();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewLegacy>>>();
  const [status, setStatus] = useState('尚未检测旧版数据。');

  async function detect() {
    setStatus('正在检测…');
    try {
      const nextPayload = await readLegacyExport();
      const nextPreview = await api.previewLegacy(nextPayload);
      setPayload(nextPayload);
      setPreview(nextPreview);
      setStatus(nextPreview.validSessions ? `发现 ${nextPreview.validSessions} 个可迁移会话。` : '当前来源下没有可迁移会话，可先从旧版页面导出 JSON 备份。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '检测失败。');
    }
  }

  async function apply() {
    if (!payload || !preview) return;
    setStatus('正在迁移，原数据会完整保留…');
    try {
      const result = await api.applyLegacy(payload, preview.fingerprint);
      setStatus(`已迁移 ${result.importedSessions} 个会话。`);
      onImported();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '迁移失败。');
    }
  }

  return (
    <section className="migration-card" aria-labelledby="legacy-migration-title">
      <div><p className="section-kicker">LEGACY DATA</p><h3 id="legacy-migration-title">旧版数据迁移</h3></div>
      <p>{status}</p>
      <div className="inline-actions">
        <button className="quiet-button" type="button" onClick={detect}>检测旧版数据</button>
        {Boolean(preview?.validSessions) && <button className="quiet-button" type="button" onClick={apply}>开始迁移</button>}
      </div>
    </section>
  );
}
