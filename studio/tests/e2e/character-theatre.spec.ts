import { expect, test } from '@playwright/test';

test('persists retry branches, pinned memory and converts only the selected branch', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '角色剧场测试', writingMode: 'both' } });
  const project = await created.json();
  await request.put(`/api/projects/${project.id}/canon/characters/character_lin`, { data: {
    schemaVersion: 1,
    name: '林默',
    goals: ['查清旧城失踪案'],
    speechPatterns: ['克制、短句'],
    currentState: { physical: '左腿旧伤', emotional: '警惕', relational: '', knowledge: '' },
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  } });

  await page.goto(`/?workspace=theatre&project=${project.id}`);
  await page.getByRole('button', { name: '新建剧场会话' }).first().click();
  await page.getByLabel('会话名称').fill('雨夜试演');
  await page.getByLabel('参与角色 林默').check();
  await page.getByLabel('用户身份').fill('负责盘问的守城人');
  await page.getByLabel('开场场景').fill('城门下着冷雨。');
  await page.getByRole('button', { name: '创建会话' }).click();

  await page.getByLabel('对话内容').fill('你为什么来旧城？');
  await page.getByLabel('OOC 指令').fill('回答克制，不透露全部目的');
  await page.getByLabel('回复候选数量').selectOption('2');
  await page.getByRole('button', { name: '发送并生成回复' }).click();
  await expect(page.getByRole('tab', { name: '候选 1' })).toBeVisible();
  await page.getByRole('button', { name: '采用此稿' }).click();
  await expect(page.getByText('E2E 候选一正文')).toBeVisible();

  await page.getByRole('button', { name: '重试此回复' }).click();
  await expect(page.getByRole('tab', { name: '候选 2' })).toBeVisible();
  await page.getByRole('tab', { name: '候选 2' }).click();
  await page.getByRole('button', { name: '采用此稿' }).click();
  await expect(page.getByText('此处有 2 个回复分支')).toBeVisible();
  await page.getByRole('button', { name: '分支 1' }).click();
  await expect(page.getByText('E2E 候选一正文')).toBeVisible();

  await page.getByLabel('固定记忆').fill('林默始终隐瞒妹妹的身份。');
  await page.getByRole('button', { name: '固定记忆' }).click();
  await expect(page.getByText('林默始终隐瞒妹妹的身份。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('E2E 候选一正文')).toBeVisible();
  await expect(page.getByText('林默始终隐瞒妹妹的身份。')).toBeVisible();

  await page.getByRole('button', { name: '转为场景卡' }).click();
  const material = page.locator('.material-preview');
  await expect(material.getByText('场景卡预览')).toBeVisible();
  await expect(material.getByText(/E2E 候选一正文/)).toBeVisible();
  await expect(material.getByText(/E2E 候选二正文/)).not.toBeVisible();
});
