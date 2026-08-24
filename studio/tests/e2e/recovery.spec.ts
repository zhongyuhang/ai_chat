import { expect, test } from '@playwright/test';

test('never auto-applies a recovery draft over a newer accepted revision', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '陈旧草稿恢复', writingMode: 'both' } })).json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n第一版正式稿', reason: 'v1' } });
  await page.goto(`/?workspace=studio&project=${project.id}`);
  const editor = page.getByRole('textbox', { name: '章节正文' });
  await editor.fill('# 第一章\n\n基于第一版的未保存草稿');
  await page.waitForTimeout(600);

  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n另一处产生的第二版正式稿', reason: 'v2' } });
  await page.reload();
  await expect(page.getByText('检测到基于旧正式稿的恢复草稿，未自动覆盖当前版本')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toContainText('另一处产生的第二版正式稿');
  await expect(page.getByRole('textbox', { name: '章节正文' })).not.toContainText('基于第一版的未保存草稿');
});

test('rejects a stale editor save instead of overwriting a newer accepted revision', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '并发保存保护', writingMode: 'both' } })).json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '第一版', reason: 'v1' } });
  await page.goto(`/?workspace=studio&project=${project.id}`);
  await expect(page.getByRole('textbox', { name: '章节正文' })).toContainText('第一版');
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '第二版', reason: 'v2' } });
  await page.getByRole('textbox', { name: '章节正文' }).fill('基于第一版的错误覆盖');
  await page.getByRole('button', { name: '保存正式稿' }).click();
  await expect(page.getByText('正式稿已在其他位置更新，请刷新后比较版本。')).toBeVisible();
  expect((await (await request.get(`/api/projects/${project.id}/chapters/chapter_001`)).json()).content).toBe('第二版');
});
