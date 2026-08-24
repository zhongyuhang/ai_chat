import { expect, test } from '@playwright/test';

test('saves accepted Markdown with a revision and survives reload', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '小说工坊测试', writingMode: 'both' } });
  const project = await created.json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n原始正文', reason: 'initial' } });

  await page.goto('/');
  await page.getByRole('button', { name: /小说工坊测试/ }).click();
  await page.getByRole('button', { name: '进入小说工坊' }).click();
  const editor = page.getByRole('textbox', { name: '章节正文' });
  await expect(editor).toContainText('原始正文');
  await editor.fill('# 第一章\n\n修改后的正式正文');
  await page.getByRole('button', { name: '保存正式稿' }).click();
  await expect(page.getByText('已保存为正式稿')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toContainText('修改后的正式正文');
  const revisions = await request.get(`/api/projects/${project.id}/chapters/chapter_001/revisions`);
  expect((await revisions.json()).revisions).toHaveLength(2);
});

test('recovers an unsaved chapter draft from the local IndexedDB journal', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '草稿恢复测试', writingMode: 'publication' } });
  const project = await created.json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n服务器正式稿', reason: 'initial' } });

  await page.goto(`/?workspace=studio&project=${project.id}`);
  const editor = page.getByRole('textbox', { name: '章节正文' });
  await expect(editor).toContainText('服务器正式稿');
  await editor.fill('# 第一章\n\n浏览器崩溃前的未保存草稿');
  await expect(page.getByText('有未保存修改')).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload();

  await expect(page.getByText('已恢复未保存草稿')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toContainText('浏览器崩溃前的未保存草稿');
  const accepted = await request.get(`/api/projects/${project.id}/chapters/chapter_001`);
  expect((await accepted.json()).content).toContain('服务器正式稿');
});

test('previews context, generates two candidates and accepts only the selected one', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: 'AI 候选测试', writingMode: 'both' } });
  const project = await created.json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '原正式稿', reason: 'initial' } });

  await page.goto(`/?workspace=studio&project=${project.id}`);
  await page.getByRole('button', { name: '生成正文' }).click();
  await page.getByLabel('写作要求').fill('写一个克制、带悬念的雨夜开篇。');
  await page.getByLabel('候选数量').selectOption('2');
  await page.getByRole('button', { name: '预览上下文' }).click();
  await expect(page.getByText('上下文预算')).toBeVisible();
  await expect(page.getByText('language-baseline@1')).toBeVisible();
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.getByRole('tab', { name: '候选 1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '候选 2' })).toBeVisible();
  await page.getByRole('tab', { name: '候选 2' }).click();
  await expect(page.getByText('E2E 候选二正文')).toBeVisible();
  await page.getByRole('button', { name: '采用此稿' }).click();
  await expect(page.getByText('已采用候选稿并保存为正式稿')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toContainText('E2E 候选二正文');
});
