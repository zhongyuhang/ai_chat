import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeAll(async () => {
  const testData = resolve(process.cwd(), 'test-results', 'e2e-data');
  await rm(testData, { recursive: true, force: true });
});

test('creates a durable local project and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建小说' }).click();
  await page.getByLabel('作品名称').fill('长夜回声');
  await page.getByLabel('写作模式').selectOption('both');
  const formValidity = await page.locator('[role="dialog"] form').evaluate((form: HTMLFormElement) => ({
    valid: form.checkValidity(),
    invalid: [...form.elements].filter((element) => element instanceof HTMLInputElement && !element.validity.valid).map((element) => (element as HTMLInputElement).name || (element as HTMLInputElement).type),
  }));
  expect(formValidity).toEqual({ valid: true, invalid: [] });
  await page.getByRole('button', { name: '创建项目' }).click();
  await expect(page.getByRole('heading', { name: '长夜回声' })).toBeVisible();
  await expect(page.getByText('目标 100.0 万字')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: '长夜回声' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 667 });
  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
});
