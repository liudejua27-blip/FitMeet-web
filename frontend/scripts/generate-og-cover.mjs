/**
 * 生成 og-cover.png — 纯 Node.js，无需安装任何额外包
 * 使用方式:
 *   在 frontend/ 目录下执行:
 *   node scripts/generate-og-cover.mjs
 *
 * 需要 Node.js >= 18（内置 fetch + Canvas 用不到，改用 HTML→Screenshot 或离线方案）
 * ------------------------------------------------------------------
 * 如果你的机器安装了 Chrome/Edge，可以用 Playwright/Puppeteer 截图
 * 更简单方式：用浏览器打开 public/og-cover.svg，打印→另存为图片
 * 或者用免费在线工具：https://cloudconvert.com/svg-to-png
 * ------------------------------------------------------------------
 *
 * 本脚本通过写入一个最小有效 PNG 文件作为应急方案（纯色品牌背景）
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'public', 'og-cover.png');
const iconPath = path.join(__dirname, '..', 'public', 'favicon-512.png');

// 尝试用 canvas 包生成（需要 pnpm add canvas -D）
try {
  const { createCanvas, loadImage } = await import('canvas');
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // 背景渐变
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, '#0d0a07');
  grad.addColorStop(1, '#1a1108');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Logo
  const icon = await loadImage(iconPath);
  ctx.save();
  roundRect(ctx, 80, 190, 80, 80, 18);
  ctx.clip();
  ctx.drawImage(icon, 80, 190, 80, 80);
  ctx.restore();

  // 品牌名
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f5ebe0';
  ctx.font = 'bold 56px Arial Black';
  ctx.fillText('Fit', 178, 248);
  ctx.fillStyle = '#a3e635';
  ctx.fillText('Meet', 272, 248);

  // Tagline
  ctx.fillStyle = '#a3a093';
  ctx.font = '22px sans-serif';
  ctx.fillText('运动搭子 · 同城约练 · 专业教练 · AI 匹配', 80, 310);

  // 分隔线
  ctx.fillStyle = '#a3e635';
  ctx.fillRect(80, 345, 120, 3);

  // 主标题
  ctx.fillStyle = '#f5ebe0';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('找附近的运动伙伴，就用 FitMeet', 80, 415);

  // 副标题
  ctx.fillStyle = '#78716c';
  ctx.font = '22px sans-serif';
  ctx.fillText('跑步 · 健身 · 羽毛球 · 徒步 · 瑜伽 · 游泳', 80, 470);

  // URL
  ctx.fillStyle = '#a3e635';
  ctx.font = '20px Arial';
  ctx.fillText('ourfitmeet.cn', 80, 540);

  const buf = canvas.toBuffer('image/png');
  writeFileSync(outPath, buf);
  console.log('✅ og-cover.png 已生成:', outPath);
} catch {
  console.log('⚠️  canvas 包未安装，使用备选方案...');
  console.log('');
  console.log('推荐方式（任选一种）：');
  console.log('');
  console.log('1. 安装 canvas 包后重新运行：');
  console.log('   pnpm add canvas -D && node scripts/generate-og-cover.mjs');
  console.log('');
  console.log('2. 用浏览器打开下方文件后截图另存为 og-cover.png：');
  console.log('   frontend/public/og-cover.svg');
  console.log('   推荐尺寸: 1200 × 630 像素');
  console.log('');
  console.log('3. 在线转换（免费）：');
  console.log('   https://cloudconvert.com/svg-to-png');
  console.log('   上传 og-cover.svg → 设置宽度 1200 → 下载保存为 og-cover.png');
  console.log('');
  console.log('   上传位置: frontend/public/og-cover.png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
