// 一次性工具：從原本的 index.html 重建 data/vocab.json。
// 用法：node scripts/extract-from-index.mjs path/to/index.html [data/vocab.json]
// 原理：把網站裡「單字資料」的兩段程式照原樣執行一次（沙盒內），取出最後的 KB 單字條目，再轉成乾淨欄位。
import fs from 'node:fs';
import vm from 'node:vm';

const [src, out = 'data/vocab.json'] = process.argv.slice(2);
if (!src) { console.error('用法：node scripts/extract-from-index.mjs path/to/index.html [out.json]'); process.exit(1); }

const lines = fs.readFileSync(src, 'utf8').split('\n');

// 1) 基礎單字：A('evoc',[ ... ]);
const s1 = lines.findIndex(l => l.startsWith("A('evoc',["));
if (s1 < 0) throw new Error("找不到 A('evoc',[ 區塊");
let e1 = s1;
while (!lines[e1].trimEnd().endsWith(']);')) e1++;

// 2) 分級單字（國小／國中 1,200 字＋大考中心高中詞彙表）：從註解到該 <script> 結尾
const s2 = lines.findIndex(l => l.includes('分級單字：國小／國中'));
if (s2 < 0) throw new Error('找不到「分級單字」區塊');
let e2 = s2;
while (!lines[e2].includes('</script>')) e2++;

const KB = [];
const ctx = { KB, A: (s, rows) => rows.forEach(r => KB.push({ id: s + r[0], s, t: r[1], d: r[2], x: r[3], y: r[4], lat: r[5], lng: r[6] })) };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(lines.slice(s1, e1 + 1).join('\n'), ctx);
vm.runInContext(lines.slice(s2, e2).join('\n'), ctx);

const raw = KB.filter(k => k.s === 'evoc').concat(ctx.HSX || []);

// 只標記「明顯是從字表剪貼錯誤」的詞：括號不成對、或詞性標記混進單字欄
const needsReview = w =>
  (w.match(/\(/g) || []).length !== (w.match(/\)/g) || []).length ||
  /\b(?:v|n|adj|adv|prep|conj|pron)\.(?:\s|\/|$)/.test(w);

const entries = raw.map(k => {
  const e = {
    id: k.id,
    word: k.t,
    pos: k.pos,
    definition_zh: k.ng ? '' : k.d,
    example: !k.ng && !k.nt ? k.x : null,
    level: k.stg || '高中',
    grade: k.gd ?? null,
    category: k.cat ?? null,
    moe1200_no: k.n1200 ?? null,
    ceec_level: k.hl ?? null,
    has_definition: !k.ng,
  };
  if (needsReview(k.t)) e.needs_review = true;
  return e;
});

const ORDER = { 國小: 0, 國中: 1, 高中: 2 };
entries.sort((a, b) =>
  ORDER[a.level] - ORDER[b.level] ||
  a.word.toLowerCase().localeCompare(b.word.toLowerCase(), 'en') ||
  a.id.localeCompare(b.id));

fs.writeFileSync(out, '[\n' + entries.map(e => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n');
console.log(`寫出 ${entries.length} 筆 → ${out}`);
