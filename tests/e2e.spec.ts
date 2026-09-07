import { test, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { RoomView } from '../src/lib/types';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3100';
const screenshots = path.join(process.cwd(), 'artifacts', 'screenshots');
test.setTimeout(300000);

async function roomView(page: Page, code: string, role: 'teacher' | 'player' | 'public' = 'public'): Promise<RoomView> {
  return page.evaluate(async ({ code, role }) => {
    const saved = role === 'public' ? undefined : JSON.parse(localStorage.getItem(`forest-tea:${role}:${code}`)!);
    const response = await fetch(`/api/rooms/${code}`, { headers: saved ? { Authorization: `Bearer ${saved.token}`, ...(saved.playerId ? { 'X-Player-Id': saved.playerId } : {}) } : {} });
    return response.json();
  }, { code, role });
}
async function mobileFits(page: Page) {
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.content, `Mobile overflow at ${page.url()}`).toBeLessThanOrEqual(width.viewport + 1);
}
async function snapshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true, animations: 'disabled' });
}
async function reveal(teacher: Page) {
  await teacher.getByRole('button', { name: '收件並揭曉', exact: true }).click();
  await teacher.getByRole('dialog').getByRole('button', { name: '確定', exact: true }).click();
  await expect(teacher.getByText('已揭曉', { exact: true })).toBeVisible();
}
async function join(context: BrowserContext, code: string, name: string) {
  const page = await context.newPage();
  await page.goto(`${origin}/join?room=${code}`);
  await page.getByLabel('大家怎麼稱呼你？').fill(name);
  await page.getByRole('button', { name: '準備好了，進店！' }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}$`));
  await expect(page.getByRole('heading', { name: '圍裙穿好了！' })).toBeVisible();
  return page;
}
async function build(page: Page, method: 'tree' | 'bagging' | 'forest', reloadDraft = false) {
  if (method !== 'tree') {
    await page.getByRole('button', { name: method === 'bagging' ? '抽我的訂單袋' : '打開我的線索袋' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await mobileFits(page);
    await page.getByRole('button', { name: '關閉視窗' }).click();
  }
  await page.locator('.feature-option').first().click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  if (reloadDraft) {
    await page.reload();
    await expect(page.getByRole('heading', { name: '回答「否」的客人，再問什麼？' })).toBeVisible();
  }
  await page.getByRole('button', { name: '到這裡就好，依這一群過去多數結果判斷' }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '到這裡就好，依這一群過去多數結果判斷' }).click();
  await page.getByRole('button', { name: '看看我的小樹', exact: true }).click();
  await mobileFits(page);
  await page.getByRole('button', { name: '鎖定我的小樹' }).click();
  await expect(page.getByText('規則已交給店長！', { exact: true })).toBeVisible();
}

test('teacher, two mobile students and public display complete a private, synchronized lesson', async () => {
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const studentAContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const studentBContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const displayContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  for (const context of [teacherContext, studentAContext, studentBContext, displayContext]) context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    const teacher = await teacherContext.newPage();
    await teacher.goto(`${origin}/teacher`);
    await teacher.getByRole('button', { name: /開店，產生邀請 QR/ }).click();
    await expect(teacher).toHaveURL(/\/teacher\/[A-Z0-9]{6}$/);
    const code = teacher.url().split('/').at(-1)!;
    await expect(teacher.getByRole('button', { name: '開始第一關', exact: true })).toBeVisible();
    const studentA = await join(studentAContext, code, '抹茶店長A');
    const studentB = await join(studentBContext, code, '奶茶店長B');
    const display = await displayContext.newPage();
    await display.goto(`${origin}/display/${code}`);
    await expect(display.getByText('課堂投影', { exact: true })).toBeVisible();
    await expect(display.getByRole('button', { name: '開始第一關' })).toHaveCount(0);
    await mobileFits(studentA);
    await snapshot(studentA, '01-mobile-lobby');
    await snapshot(teacher, '02-teacher-lobby');
    await expect.poll(async () => (await roomView(teacher, code, 'teacher')).players.length).toBe(2);

    const denied = await display.request.post(`${origin}/api/rooms/${code}`, { data: { action: 'advance' } });
    expect(denied.status()).toBe(403);
    for (const identity of ['teacher', 'player', 'public'] as const) {
      const view = await roomView(identity === 'teacher' ? teacher : identity === 'player' ? studentA : display, code, identity);
      const json = JSON.stringify(view);
      for (const secret of ['ownerHash', 'tokenHash', '"seed"', 'testOrders', 'test-']) expect(json).not.toContain(secret);
      if (identity === 'public') expect(view.me).toBeUndefined();
    }
    await teacher.getByRole('button', { name: '開始第一關', exact: true }).click();
    for (const method of ['tree', 'bagging', 'forest'] as const) {
      await expect.poll(async () => (await roomView(studentA, code, 'player')).phase).toBe(method);
      await build(studentA, method, method === 'tree');
      await build(studentB, method);
      await expect.poll(async () => (await roomView(teacher, code, 'teacher')).submitted).toBe(2);
      await mobileFits(studentA);
      await snapshot(studentA, `03-mobile-${method}`);
      const saved = (await roomView(studentA, code, 'player')).me!;
      await studentA.reload();
      await expect(studentA.getByText('規則已交給店長！', { exact: true })).toBeVisible();
      const resumed = (await roomView(studentA, code, 'player')).me!;
      expect(resumed.id).toBe(saved.id);
      expect(resumed.trees[method]).toEqual(saved.trees[method]);
      expect((await roomView(display, code)).showcase).toBeUndefined();
      await reveal(teacher);
      await expect(studentA.getByRole('heading', { name: '大家一起，猜得怎麼樣？' })).toBeVisible();
      const revealed = await roomView(display, code);
      expect(revealed.observation!.yes + revealed.observation!.no).toBe(2);
      await teacher.getByRole('button', { name: '前往下一階段', exact: true }).click();
    }

    for (let round = 0; round < 3; round++) {
      await expect.poll(async () => (await roomView(studentA, code, 'player')).round).toBe(round);
      for (const [index, page] of [studentA, studentB].entries()) {
        await expect(page.getByRole('heading', { name: '你想推薦哪一個幫手？' })).toBeVisible();
        await page.locator('.candidate-main').nth(index).click();
        await page.getByRole('button', { name: '送出我的接力提案' }).click();
        await expect(page.getByText('你的接力提案已送出！', { exact: true })).toBeVisible();
      }
      const hidden = await roomView(display, code);
      expect(hidden.boost?.selected).toBeUndefined();
      expect(hidden.proposalCounts).toBeUndefined();
      await mobileFits(studentA);
      await snapshot(studentA, `04-mobile-boost-${round + 1}`);
      await expect.poll(async () => (await roomView(teacher, code, 'teacher')).submitted).toBe(2);
      await reveal(teacher);
      const revealed = await roomView(display, code);
      expect(revealed.boost!.selected!.error).toBe(Math.min(...revealed.boost!.candidates.map(c => c.error)));
      expect(Object.values(revealed.proposalCounts!).reduce((sum, n) => sum + n, 0)).toBe(2);
      await teacher.getByRole('button', { name: round < 2 ? '開始下一輪接力' : '前往下一階段', exact: true }).click();
    }

    await expect(studentA.getByRole('heading', { name: '答案還在信封裡' })).toBeVisible();
    const sealed = await roomView(display, code);
    expect(sealed.phase).toBe('final');
    expect(sealed.testOrders).toBeUndefined();
    expect(sealed.results).toBeUndefined();
    await teacher.getByRole('button', { name: '揭曉封存題成績', exact: true }).click();
    await expect(studentA.getByText('新客人的答案揭曉了！', { exact: true })).toBeVisible();
    const results = await roomView(display, code);
    expect(results.testOrders).toHaveLength(12);
    expect(results.results).toHaveLength(8);
    expect(results.results!.filter(row => row.name.startsWith('系統示範'))).toHaveLength(4);
    await mobileFits(studentA);
    await snapshot(studentA, '05-mobile-results');
    const downloadPromise = teacher.waitForEvent('download');
    await teacher.getByRole('button', { name: 'CSV', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`forest-tea-${code}.csv`);
    await download.saveAs(path.join(process.cwd(), 'artifacts', 'e2e-results.csv'));
    await teacher.getByRole('button', { name: '前往下一階段', exact: true }).click();
    for (const page of [studentA, studentB]) {
      await expect(page.getByRole('heading', { name: '領取你的店長徽章' })).toBeVisible();
      for (const [question, answer] of [1, 1, 0].entries()) await page.locator('.quiz-card').nth(question).getByRole('button').nth(answer).click();
      await page.getByRole('button', { name: '完成店長挑戰' }).click();
      await expect(page.getByText('答對 3 / 3 題！', { exact: true })).toBeVisible();
    }
    await mobileFits(studentA);
    await snapshot(studentA, '06-mobile-quiz');
    await expect.poll(async () => (await roomView(teacher, code, 'teacher')).reflections?.answered).toBe(2);
    await teacher.getByRole('button', { name: '完成課堂', exact: true }).click();
    await expect(studentA.getByRole('heading', { name: '辛苦了，抹茶店長A店長！' })).toBeVisible();
    const ended = await roomView(display, code);
    expect(ended.phase).toBe('ended');
    expect(ended.open).toBe(false);
    expect(ended.reflections).toEqual({ answered: 2, correct: [2, 2, 2] });
    const lateJoin = await display.request.post(`${origin}/api/rooms/${code}/join`, { data: { name: '晚到', avatar: 0 } });
    expect(lateJoin.status()).toBe(409);
    await mobileFits(studentA);
    await snapshot(studentA, '07-mobile-graduation');
    await snapshot(display, '08-display-results');
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
