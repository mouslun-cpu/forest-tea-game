import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:3101';
const screenshots = path.join(process.cwd(), 'artifacts', 'screenshots');

test('入門課從選一個問題走到森林與回顧', async ({ browser }) => {
  await mkdir(screenshots, { recursive: true });
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();

  await teacher.goto(`${origin}/teacher`);
  await expect(teacher.getByText('入門 · 第一次玩推薦')).toBeVisible();
  await teacher.getByRole('button', { name: /開店，產生邀請 QR/ }).click();
  await expect(teacher).toHaveURL(/\/teacher\/[A-Z0-9]{6}$/);
  const code = teacher.url().split('/').pop()!;

  await student.goto(`${origin}/join?room=${code}`);
  await student.getByLabel('大家怎麼稱呼你？').fill('測試店長');
  await student.getByRole('button', { name: /準備好了，進店/ }).click();
  await expect(student.getByRole('heading', { name: '圍裙穿好了！' })).toBeVisible();
  await expect(student.getByText('你是店長', { exact: true })).toBeVisible();

  await teacher.getByRole('button', { name: '開始第一關' }).click();
  await expect(student.getByRole('heading', { name: '選一個問題', exact: true })).toBeVisible();
  await student.locator('.feature-option').first().click();
  await expect(student.getByRole('heading', { name: '這就是你的小樹' })).toBeVisible();
  await student.reload();
  await expect(student.getByRole('heading', { name: '這就是你的小樹' })).toBeVisible();
  await student.getByRole('button', { name: '送出我的小樹' }).click();
  await expect(student.getByText('你的規則已送出！')).toBeVisible();
  await expect(student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).resolves.toBe(true);
  await student.screenshot({ path: path.join(screenshots, 'simple-tree-mobile.png'), fullPage: true });

  await teacher.getByRole('button', { name: '收件並揭曉' }).click();
  await expect(teacher.getByText('已揭曉', { exact: true })).toBeVisible();
  await teacher.getByRole('button', { name: '前往下一階段' }).click();
  await expect(student.getByRole('heading', { name: '全班一起投票' })).toBeVisible();
  await expect(student.getByText('每個店長，都有自己的小樹')).toBeVisible();
  await student.locator('.feature-option').first().click();
  await student.getByRole('button', { name: '送出我的小樹' }).click();
  await teacher.getByRole('button', { name: '收件並揭曉' }).click();
  await expect(teacher.getByText('已揭曉', { exact: true })).toBeVisible();
  await teacher.screenshot({ path: path.join(screenshots, 'simple-forest-teacher.png'), fullPage: true });

  await teacher.getByRole('button', { name: '前往下一階段' }).click();
  await expect(student.getByRole('heading', { name: '真正的新客人，來了！' })).toBeVisible();
  await expect(student.getByText('6 張沒看過的訂單')).toBeVisible();
  await teacher.getByRole('button', { name: '揭曉封存題成績' }).click();
  await expect(teacher.getByText('全班手作森林')).toBeVisible();
  await expect(teacher.getByText('全班 Bagging')).toHaveCount(0);
  await expect(teacher.getByText('全班 AdaBoost')).toHaveCount(0);
  await teacher.getByRole('button', { name: '前往下一階段' }).click();

  await expect(student.getByRole('heading', { name: '領取你的店長徽章' })).toBeVisible();
  for (const card of await student.locator('.quiz-card').all()) await card.locator('.quiz-option').first().click();
  await student.getByRole('button', { name: '完成店長挑戰' }).click();
  await teacher.getByRole('button', { name: '完成課堂' }).click();
  await expect(student.getByText('森林店長 · 挑戰完成')).toBeVisible();
  await expect(student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).resolves.toBe(true);
  await student.screenshot({ path: path.join(screenshots, 'simple-finished-mobile.png'), fullPage: true });

  await teacherContext.close();
  await studentContext.close();
});
