// 驗證 data/vocab.json，並產生衍生檔：vocab.csv、levels/*.json、manifest.json
// 用法：npm run build（或 node scripts/build.mjs）。只用 Node 內建模組，不需 npm install。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.join(root, 'data');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const entries = JSON.parse(fs.readFileSync(path.join(dataDir, 'vocab.json'), 'utf8'));

const POS = new Set(['n', 'v', 'a', 'd', 'p', 'c', 'r', 'm', 'q', 'x', 'i']);
const LEVELS = { 國小: 'elementary', 國中: 'junior', 高中: 'senior' };

// ---------- 驗證 ----------
const errors = [];
const err = (e, msg) => errors.push(`${e && e.id || '?'}：${msg}`);
const ids = new Set(), moe = new Set();
for (const e of entries) {
  if (!e.id || ids.has(e.id)) err(e, 'id 缺少或重複'); ids.add(e.id);
  if (!e.word || !e.word.trim()) err(e, 'word 為空');
  if (!POS.has(e.pos)) err(e, `pos 不合法：${e.pos}`);
  if (!(e.level in LEVELS)) err(e, `level 不合法：${e.level}`);
  if (typeof e.has_definition !== 'boolean') err(e, 'has_definition 必須是布林值');
  if (e.has_definition !== (e.definition_zh !== '')) err(e, 'has_definition 與 definition_zh 不一致');
  if (!(e.example === null || typeof e.example === 'string')) err(e, 'example 必須是字串或 null');
  if (!e.has_definition && e.example !== null) err(e, '沒有詞義的條目不應有例句');
  if (e.grade !== null && !Number.isInteger(e.grade)) err(e, 'grade 必須是整數或 null');
  if (e.ceec_level !== null && !(e.ceec_level >= 1 && e.ceec_level <= 6)) err(e, 'ceec_level 必須是 1–6 或 null');
  if (e.moe1200_no !== null) { if (moe.has(e.moe1200_no)) err(e, `moe1200_no 重複：${e.moe1200_no}`); moe.add(e.moe1200_no); }
}
if (moe.size !== 1200) errors.push(`moe1200_no 應有 1200 個不重複編號，目前 ${moe.size}`);
if (errors.length) { console.error(errors.slice(0, 30).join('\n')); console.error(`共 ${errors.length} 個問題`); process.exit(1); }

// ---------- 輸出 ----------
const toJson = arr => '[\n' + arr.map(e => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n';
const write = (rel, text) => { const p = path.join(dataDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };

// CSV（加 BOM，Excel 直接開啟中文不會亂碼）
const COLS = ['id', 'word', 'pos', 'definition_zh', 'example', 'level', 'grade', 'category', 'moe1200_no', 'ceec_level', 'has_definition', 'needs_review'];
const cell = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
write('vocab.csv', '\ufeff' + COLS.join(',') + '\r\n' + entries.map(e => COLS.map(c => cell(e[c])).join(',')).join('\r\n') + '\r\n');

for (const [zh, en] of Object.entries(LEVELS)) write(`levels/${en}.json`, toJson(entries.filter(e => e.level === zh)));

const files = ['vocab.json', 'vocab.csv', ...Object.values(LEVELS).map(n => `levels/${n}.json`)].map(rel => {
  const buf = fs.readFileSync(path.join(dataDir, rel));
  return { path: `data/${rel}`, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
});
const count = f => entries.filter(f).length;
const manifest = {
  name: pkg.name,
  version: pkg.version,
  total: entries.length,
  with_definition: count(e => e.has_definition),
  without_definition: count(e => !e.has_definition),
  with_example: count(e => e.example !== null),
  needs_review: count(e => e.needs_review),
  by_level: Object.fromEntries(Object.keys(LEVELS).map(l => [l, {
    total: count(e => e.level === l),
    with_definition: count(e => e.level === l && e.has_definition),
    with_example: count(e => e.level === l && e.example !== null),
  }])),
  sources: ['教育部國中小基本英語字彙 1,200 字', '大考中心高中英文參考詞彙表（111 學年度起適用）'],
  files,
};
fs.writeFileSync(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`OK：${entries.length} 筆，已產生 CSV、levels/*.json、manifest.json`);
console.log(JSON.stringify(manifest.by_level, null, 2));
