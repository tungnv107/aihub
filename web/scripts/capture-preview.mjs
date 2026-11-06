import 'dotenv/config';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.BETTER_AUTH_URL).hostname)) throw Error('Local preview only');
fs.mkdirSync('../.runtime', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(process.env.BETTER_AUTH_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.hero-copy')).opacity === '1');
  await page.screenshot({ path: '../.runtime/aihub-landing-desktop.png', fullPage: true });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('Layout overflow at ' + width);
    await page.screenshot({ path: '../.runtime/aihub-landing-' + width + '.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Đổi giao diện sáng/tối' }).click();
  await page.screenshot({ path: '../.runtime/aihub-mobile-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw Error('English mobile overflow');
  const signed = await context.request.post(process.env.BETTER_AUTH_URL + '/api/auth/sign-in/email', { headers: { origin: process.env.BETTER_AUTH_URL }, data: { email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD } });
  if (!signed.ok()) throw Error('Preview login failed: ' + signed.status());
  await context.addCookies([{ name: 'locale', value: 'vi', url: process.env.BETTER_AUTH_URL }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [route, name] of [['/dashboard', 'dashboard-empty'], ['/admin', 'admin-overview']]) {
    await page.goto(process.env.BETTER_AUTH_URL + route, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '../.runtime/aihub-' + name + '.png', fullPage: true });
  }
  console.log('Desktop, tablet, mobile, themes, English and authenticated previews captured.');
} finally { await browser.close(); }
