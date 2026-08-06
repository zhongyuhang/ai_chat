const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://a057a59770d076d959c.bqg301.cc';
const OUTPUT = 'D:/ai_chat/妻孝.txt';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Load the page to get get_api, CryptoJS, etc.
  await page.goto(`${BASE}/book/144091/1.html`, { waitUntil: 'networkidle', timeout: 30000 });

  const writeStream = fs.createWriteStream(OUTPUT, { encoding: 'utf-8' });
  writeStream.write('妻孝\n作者：性心魔\n');
  writeStream.write('='.repeat(60) + '\n\n');

  console.log('Fetching all 37 chapters via browser API...\n');

  for (let ch = 1; ch <= 37; ch++) {
    try {
      const result = await page.evaluate(async (chapterId) => {
        const apiUrl = window.get_api('chapter', { id: 144091, chapterid: chapterId });
        const resp = await fetch(apiUrl);
        const json = await resp.json();
        return { txt: json.txt || '', chaptername: json.chaptername || '' };
      }, ch);

      const title = result.chaptername || `第${ch}章`;
      writeStream.write(`\n${'='.repeat(60)}\n`);
      writeStream.write(`${title}\n`);
      writeStream.write(`${'='.repeat(60)}\n\n`);
      writeStream.write(result.txt + '\n\n');

      console.log(`Chapter ${ch}/37: ${title} (${result.txt.length} chars)`);
    } catch (e) {
      console.error(`  ERROR ch${ch}: ${e.message}`);
    }
  }

  writeStream.end();
  await browser.close();

  const stats = fs.statSync(OUTPUT);
  console.log(`\n=== DONE ===`);
  console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`File: ${OUTPUT}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
