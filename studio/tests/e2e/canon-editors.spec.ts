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

test('persists personality, relationships, timeline, foreshadowing and hierarchical outline', async ({ page, request }) => {
  const created = await request.post('/api/projects', { data: { title: '全书规划测试', writingMode: 'publication' } });
  const project = await created.json();
  await page.goto(`/?workspace=canon&project=${project.id}`);

  for (const character of [
    { name: '林默', goal: '寻找妹妹', speech: '说话克制，避免感叹号', state: '左腿旧伤' },
    { name: '苏晚', goal: '保护旧城秘密', speech: '温和但常用反问', state: '隐瞒真相' },
  ]) {
    await page.getByRole('button', { name: '新建角色' }).click();
    await page.getByLabel('姓名').fill(character.name);
    await page.getByLabel('核心目标').fill(character.goal);
    await page.getByLabel('说话习惯').fill(character.speech);
    await page.getByLabel('当前身体状态').fill(character.state);
    await page.getByRole('button', { name: '保存角色' }).click();
  }

  await page.getByRole('tab', { name: '人物关系' }).click();
  await page.getByRole('button', { name: '新建人物关系' }).click();
  await page.getByLabel('关系起点').selectOption({ label: '林默' });
  await page.getByLabel('关系终点').selectOption({ label: '苏晚' });
  await page.getByLabel('公开关系').fill('暂时合作');
  await page.getByLabel('真实情感').fill('彼此怀疑又相互依赖');
  await page.getByLabel('核心冲突').fill('妹妹失踪与旧城秘密相关');
  await page.getByRole('button', { name: '保存人物关系' }).click();

  await page.getByRole('tab', { name: '时间线' }).click();
  await page.getByRole('button', { name: '新建时间线事件' }).click();
  await page.getByLabel('事件名称').fill('林默抵达旧城');
  await page.getByLabel('故事内时间').fill('霜月第三日夜');
  await page.getByRole('button', { name: '保存时间线事件' }).click();

  await page.getByRole('tab', { name: '伏笔' }).click();
  await page.getByRole('button', { name: '新建伏笔' }).click();
  await page.getByLabel('埋设内容').fill('苏晚从不直视城门上的镜子');
  await page.getByLabel('预期回收').fill('揭示镜子会暴露她的真实身份');
  await page.getByRole('button', { name: '保存伏笔' }).click();

  await page.getByRole('tab', { name: '全书规划' }).click();
  await page.getByLabel('故事前提').fill('一名调查者进入封闭十年的旧城寻找妹妹。');
  await page.getByLabel('文风约束').fill('克制、具体、第三人称限知。');
  await page.getByRole('button', { name: '保存全书契约' }).click();
  await page.getByRole('button', { name: '新增卷' }).click();
  await page.getByLabel('卷名').fill('第一卷 雾城');
  await page.getByLabel('卷目标').fill('进入旧城并建立核心人物关系');
  await page.getByRole('button', { name: '保存卷' }).click();
  await page.getByRole('button', { name: '新增章纲' }).click();
  await page.getByLabel('章纲标题').fill('第一章 雨夜入城');
  await page.getByLabel('本章目的').fill('让林默与苏晚首次交锋');
  await page.getByLabel('结尾钩子').fill('林默在镜中看不见苏晚');
  await page.getByRole('button', { name: '保存章纲' }).click();

  await page.reload();
  await page.getByRole('tab', { name: '全书规划' }).click();
  await expect(page.getByText('第一卷 雾城')).toBeVisible();
  await expect(page.getByText('第一章 雨夜入城')).toBeVisible();
  await page.getByRole('tab', { name: '人物关系' }).click();
  await expect(page.getByText('彼此怀疑又相互依赖')).toBeVisible();
});
