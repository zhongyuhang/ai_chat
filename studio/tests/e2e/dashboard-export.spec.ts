import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('shows accepted manuscript analytics and downloads an accepted-only Markdown export', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '导出测试小说', writingMode: 'publication' } })).json();
  await request.put(`/api/projects/${project.id}/outline/volumes/volume_001`, { data: { title: '第一卷' } });
  await request.put(`/api/projects/${project.id}/outline/volumes/volume_001/chapters/chapter_001`, { data: { title: '第一章', purpose: '开篇' } });
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n只属于正式稿的正文。', reason: 'accepted' } });

  await page.goto('/');
  await page.getByRole('button', { name: /导出测试小说/ }).click();
  await expect(page.getByText('已采用 1 / 1 章')).toBeVisible();
  await expect(page.getByText('只属于正式稿的正文。')).not.toBeVisible();
  await page.getByRole('button', { name: '导出作品' }).click();
  await page.getByLabel('导出格式').selectOption('markdown');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '生成并下载' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('导出测试小说.md');
  const content = await readFile(await download.path() as string, 'utf8');
  expect(content).toContain('只属于正式稿的正文。');
  expect(content).not.toContain('DEEPSEEK_API_KEY');
});
