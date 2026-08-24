import { expect, test } from '@playwright/test';

test('cites exact issues and records an auditable publication waiver', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '出版审校测试', writingMode: 'publication' } })).json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n“未闭合的引语。\n\n重复段落。\n\n重复段落。', reason: 'initial' } });
  await page.goto(`/?workspace=studio&project=${project.id}`);

  await page.getByRole('button', { name: '出版审校' }).click();
  await expect(page.getByRole('heading', { name: '出版质量报告' })).toBeVisible();
  await expect(page.getByText(/总分 .* \/ 100/)).toBeVisible();
  await expect(page.getByText('中文引号 “” 未成对。')).toBeVisible();
  await page.getByRole('button', { name: /中文引号/ }).click();
  await expect(page.getByRole('textbox', { name: '章节正文' })).toBeFocused();
  await expect(page.getByRole('button', { name: '采用达标稿' })).toBeDisabled();

  await page.getByRole('button', { name: '记录理由后采用' }).click();
  await page.getByLabel('采用理由').fill('此处为有意保留的开放式引语，后章闭合。');
  await page.getByRole('button', { name: '确认采用并记录' }).click();
  await expect(page.locator('.waiver-badge')).toHaveText('已记录人工豁免');
  await page.reload();
  await expect(page.locator('.waiver-badge')).toHaveText('已记录人工豁免');
});
