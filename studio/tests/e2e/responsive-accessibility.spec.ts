import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }))).toEqual({ viewport: 390, body: 390, root: 390 });
}

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

test('keeps project, canon and studio workflows usable at 390px with keyboard and WCAG basics', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '移动端可访问测试', writingMode: 'both' } })).json();
  await request.put(`/api/projects/${project.id}/chapters/chapter_001`, { data: { content: '# 第一章\n\n移动端正文。', reason: 'initial' } });

  await page.goto('/');
  await expectNoOverflow(page);
  await expectNoSeriousAxeViolations(page);

  await page.goto(`/?workspace=canon&project=${project.id}`);
  await expect(page.getByRole('tab', { name: '全书规划' })).toBeVisible();
  await expectNoOverflow(page);
  await expectNoSeriousAxeViolations(page);

  await page.goto(`/?workspace=studio&project=${project.id}`);
  await expect(page.getByRole('textbox', { name: '章节正文' })).toBeVisible();
  await expectNoOverflow(page);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).not.toHaveCount(0);
  await expectNoSeriousAxeViolations(page);
});

test('keeps theatre branches and message actions keyboard-accessible on mobile', async ({ page, request }) => {
  const project = await (await request.post('/api/projects', { data: { title: '移动剧场', writingMode: 'both' } })).json();
  await request.put(`/api/projects/${project.id}/canon/characters/character_lin`, { data: { schemaVersion: 1, name: '林默', createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z' } });
  const session = await (await request.post(`/api/projects/${project.id}/theatre`, { data: { title: '移动试演', participantIds: ['character_lin'], opening: { role: 'system', content: '雨夜。' } } })).json();
  const userTurn = await (await request.post(`/api/projects/${project.id}/theatre/${session.id}/nodes/${session.graph.rootId}/append`, { data: { role: 'user', content: '你来做什么？' } })).json();
  await request.post(`/api/projects/${project.id}/theatre/${session.id}/nodes/${userTurn.graph.activeLeafId}/append`, { data: { role: 'assistant', content: '找人。' } });

  await page.goto(`/?workspace=theatre&project=${project.id}`);
  await expect(page.getByText('找人。')).toBeVisible();
  await expectNoOverflow(page);
  const retry = page.getByRole('button', { name: '重试此回复' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await expectNoSeriousAxeViolations(page);
});
