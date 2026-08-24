import { createHash } from 'node:crypto';
import type { Manuscript } from './manuscript-model.js';

export function renderPortableJson(manuscript: Manuscript): string {
  const portable = { format: 'ai-novel-studio-manuscript', schemaVersion: 1, manuscript };
  const checksum = createHash('sha256').update(JSON.stringify(portable)).digest('hex');
  return JSON.stringify({ ...portable, checksum }, null, 2);
}
