// 抓取各大新聞網「公開 RSS」的標題與連結，輸出 news.json（只存標題、連結、時間、來源，不存內文）。
// 執行：node scripts/fetch-news.mjs      需要 Node.js 18 以上（內建 fetch，不需安裝套件）
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const OUT = 'news.json';
const MAX_AGE_H = 48;     // 只保留最近 48 小時
const PER_FEED = 20;      // 每個 RSS 最多取幾則
const MAX_ITEMS = 240;    // news.json 最多幾則
const TIMEOUT = 15000;    // 每個來源 15 秒逾時
const UA = 'Mozilla/5.0 (compatible; study-news-bot/1.0; +https://wengchiehyun-cell.github.io/study.github.io/)';

// 來源清單：verified=true 表示 RSS 網址已由該媒體網站公開確認；false 表示依常見格式填寫，失敗時會在紀錄中標示。
// 想增減來源，改這裡即可。cat 為此 RSS 固定分類（null 代表依連結與標題判斷）。
export const FEEDS = [
  { id: 'pts', src: '公視新聞網', url: 'https://news.pts.org.tw/xml/newsfeed.xml', cat: null, verified: true },
  { id: 'ltn', src: '自由時報', url: 'https://news.ltn.com.tw/rss/all.xml', cat: null, verified: true },
  { id: 'cna', src: '中央社', url: 'https://feeds.feedburner.com/rsscna/politics', cat: 'politics', verified: false },
  { id: 'cna', src: '中央社', url: 'https://feeds.feedburner.com/rsscna/social', cat: 'society', verified: false },
  { id: 'cna', src: '中央社', url: 'https://feeds.feedburner.com/rsscna/finance', cat: 'economy', verified: false },
  { id: 'cna', src: '中央社', url: 'https://feeds.feedburner.com/rsscna/intworld', cat: 'world', verified: false },
  { id: 'udn', src: '聯合新聞網', url: 'https://udn.com/rssfeed/news/2/6638?ch=news', cat: null, verified: false },
  { id: 'twr', src: '報導者', url: 'https://www.twreporter.org/a/rss2.xml', cat: null, verified: false },
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
  if (g[0] === '#') { const n = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[g.toLowerCase()] ?? m;
});
export const clean = (s) => decode(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

export function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const b = m[0];
    const title = clean(tag(b, 'title'));
    let link = clean(tag(b, 'feedburner:origLink')) || clean(tag(b, 'link'));
    if (!link) { const h = b.match(/<link[^>]*?href=["']([^"']+)["']/i); link = h ? decode(h[1]) : ''; }
    if (!link) link = clean(tag(b, 'guid'));
    const date = clean(tag(b, 'pubDate')) || clean(tag(b, 'dc:date')) || clean(tag(b, 'published')) || clean(tag(b, 'updated'));
    const category = clean(tag(b, 'category'));
    if (title && link) out.push({ title, link, date, category });
  }
  return out;
}

const OK_HOST = /(^|\.)(cna\.com\.tw|pts\.org\.tw|ltn\.com\.tw|udn\.com|twreporter\.org)$/;
export function safeUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol === 'http:') x.protocol = 'https:';
    if (x.protocol !== 'https:' || !OK_HOST.test(x.hostname)) return null;
    for (const k of [...x.searchParams.keys()]) if (/^utm_|^fbclid$|^from$|^ch$/.test(k) && !/udn\.com/.test(x.hostname)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString();
  } catch { return null; }
}

const KW = [
  ['politics', /立法院|行政院|總統|副總統|憲法|大法官|立委|部長|政府|法案|修法|預算|議員|市長|縣長|公投|罷免|選舉|政黨|國民黨|民進黨|民眾黨|內閣|院長/],
  ['economy', /股市|股價|匯率|利率|央行|通膨|物價|GDP|經濟|薪資|景氣|房價|關稅|營收|財報|投資|貿易|產業/],
  ['society', /判決|檢察|地檢|警方|詐騙|車禍|火警|起訴|羈押|法官|地院|高院|死刑|毒品|霸凌|交通|消防|災害|地震|颱風/],
  ['world', /美國|中國|日本|俄羅斯|烏克蘭|以色列|伊朗|歐盟|聯合國|北約|韓國|川普|習近平|普丁|全球|國際|兩岸/],
];
export function catOf(link, title, category, fixed) {
  if (fixed) return fixed;
  const u = link || '';
  let m;
  if ((m = u.match(/ltn\.com\.tw\/news\/([a-z]+)\//i))) { const c = { politics: 'politics', society: 'society', world: 'world', business: 'economy' }[m[1].toLowerCase()]; if (c) return c; }
  if (/ec\.ltn\.com\.tw/i.test(u)) return 'economy';
  if ((m = u.match(/cna\.com\.tw\/news\/([a-z]+)\//i))) { const c = { aipl: 'politics', asoc: 'society', afe: 'economy', aopl: 'world', acn: 'world' }[m[1].toLowerCase()]; if (c) return c; }
  const cat = category || '';
  if (/政治/.test(cat)) return 'politics'; if (/社會|社福|人權/.test(cat)) return 'society';
  if (/全球|兩岸|國際/.test(cat)) return 'world'; if (/產經|財經|經濟/.test(cat)) return 'economy';
  for (const [c, re] of KW) if (re.test(title)) return c;
  return 'other';
}

async function fetchText(url) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

export function buildItems(feed, rows, now = Date.now()) {
  const items = [];
  for (const r of rows.slice(0, PER_FEED)) {
    const u = safeUrl(r.link); if (!u) continue;
    let ts = Date.parse(r.date); if (!Number.isFinite(ts)) ts = now;
    if (ts > now + 3600e3) ts = now;                       // 時間晚於現在太多，視為資料錯誤
    if (now - ts > MAX_AGE_H * 3600e3) continue;          // 太舊
    items.push({ s: feed.src, c: catOf(u, r.title, r.category, feed.cat), t: r.title.slice(0, 120), u, p: new Date(ts).toISOString() });
  }
  return items;
}

export function merge(all) {
  const seenU = new Set(), seenT = new Set(), out = [];
  for (const it of all.sort((a, b) => b.p.localeCompare(a.p))) {
    const k = it.u.replace(/[?#].*$/, ''), tk = it.s + '|' + it.t.replace(/\s+/g, '');
    if (seenU.has(k) || seenT.has(tk)) continue;
    seenU.add(k); seenT.add(tk); out.push(it);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

async function main() {
  let prev = null; try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const all = [], status = [];
  for (const f of FEEDS) {
    try {
      const rows = parseFeed(await fetchText(f.url));
      const items = buildItems(f, rows);
      all.push(...items);
      status.push({ src: f.src, cat: f.cat, ok: true, n: items.length });
      console.log(`✔ ${f.src} ${f.cat ?? ''} ${items.length} 則`);
    } catch (e) {
      status.push({ src: f.src, cat: f.cat, ok: false, err: String(e.message || e).slice(0, 80), verified: f.verified });
      console.warn(`✘ ${f.src} ${f.url} 失敗：${e.message || e}${f.verified ? '' : '（此網址尚未確認，請檢查該媒體的 RSS 頁面）'}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const items = merge(all);
  if (!items.length) { console.warn('沒有取得任何新聞，保留舊的 news.json'); return; }
  if (prev && JSON.stringify(prev.items) === JSON.stringify(items)) { console.log('內容沒有變動，不更新檔案'); return; }
  await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), items, status }), 'utf8');
  console.log(`已寫入 ${OUT}：${items.length} 則`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
