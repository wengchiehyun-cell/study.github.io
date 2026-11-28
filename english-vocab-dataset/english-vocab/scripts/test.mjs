// 載入器的基本檢查：node scripts/test.mjs（不需網路，用檔案系統模擬 fetch）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const V = createRequire(import.meta.url)(path.join(root, 'loader/vocab-loader.js'));
const BASE = 'https://example.test/data/';

// 用檔案系統代替網路
globalThis.fetch = async url => {
  assert.ok(url.startsWith(BASE), '網址應以 base 開頭：' + url);
  const p = path.join(root, 'data', url.slice(BASE.length));
  if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
  return new Response(fs.readFileSync(p));
};

const all = await V.load({ base: BASE });
assert.equal(all.length, JSON.parse(fs.readFileSync(path.join(root, 'data/manifest.json'), 'utf8')).total);

// 只載入部分年級
const small = await V.load({ base: BASE, levels: ['國小', '國中'] });
assert.ok(small.length > 0 && small.every(e => e.level !== '高中'));

// 轉成網站 KB 格式
const { kb, hsx } = V.toKB(all);
assert.ok(kb.every(k => k.s === 'evoc' && k.d && !k.ng));
assert.ok(hsx.every(k => k.ng === 1 && k.d === ''));
assert.ok(kb.filter(k => !k.stg).length > 0, '高中條目不應帶 stg');
const nt = kb.find(k => k.nt === 1);
assert.match(nt.x, /^(教育部基本 1,200 字表第 \d+ 字|大考中心高中英文參考詞彙表 第 \d 級)$/);

// install：會取代 KB 內既有的 evoc 條目、保留其他科目
globalThis.window = globalThis; globalThis.HSX = [];
const KB = [{ id: 'math1', s: 'math' }, { id: 'evoc-stale', s: 'evoc', t: '__stale__' }];
const n = await V.install(KB, { base: BASE });
assert.equal(n, kb.length);
assert.equal(KB.filter(k => k.s === 'math').length, 1);
assert.equal(KB.filter(k => k.s === 'evoc').length, kb.length);
assert.equal(KB.find(k => k.id === 'evoc-stale'), undefined);
assert.equal(window.HSX.length, hsx.length);

// 載入失敗要丟出錯誤（不能默默變成空資料）
await assert.rejects(V.load({ base: 'https://example.test/nope/' }));
console.log('全部通過');
