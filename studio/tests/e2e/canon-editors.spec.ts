import { expect, test } from '@playwright/test';

test('creates a character and previews an explainable keyword world-book hit', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '设定库测试', writingMode: 'both' } });
  const project = await created.json();
  await page.goto('/');
  await page.getByRole('button', { name: /设定库测试/ }).click();
  await page.getByRole('button', { name: '设定库', exact: true }).click();

  await page.getByRole('button', { name: '新建角色' }).click();
  await page.getByLabel('姓名').fill('林默');
  await page.getByLabel('核心目标').fill('查清失踪案');
  await page.getByRole('button', { name: '保存角色' }).click();
  await expect(page.getByText('林默')).toBeVisible();

  await page.getByRole('tab', { name: '世界书' }).click();
  await page.getByRole('button', { name: '新建世界书条目' }).click();
  await page.getByLabel('条目名称').fill('旧王都');
  await page.getByLabel('触发关键词').fill('王都');
  await page.getByLabel('设定内容').fill('王都已封锁十年。');
  await page.getByRole('button', { name: '保存世界书' }).click();
  await page.getByLabel('触发预览文本').fill('林默抵达王都。');
  await page.getByRole('button', { name: '预览命中' }).click();
  await expect(page.getByText('命中：王都')).toBeVisible();
  await expect(page.getByText('原因：keyword:王都')).toBeVisible();

  expect(project.id).toMatch(/^project_/);
});
