/*!
 * english-vocab loader v1.0.0
 * 把 GitHub 上的單字資料集載入網站，並轉成網站原本使用的 KB 條目格式。
 * 無外部相依；瀏覽器（classic script 或 <script type="module">）與 Node 18+ 皆可使用。
 *
 *   <script src="https://cdn.jsdelivr.net/gh/wengchiehyun-cell/english-vocab@1/loader/vocab-loader.js"></script>
 *   <script>VocabDataset.install(KB).then(n => { stats(); })</script>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VocabDataset = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 預設資料來源。@1 代表「最新的 1.x.x 標籤」；要完全固定內容請改成 @1.0.0 或 commit hash。
  var DEFAULT_BASE = 'https://cdn.jsdelivr.net/gh/wengchiehyun-cell/english-vocab@1/data/';
  var LEVEL_FILE = { '國小': 'elementary', '國中': 'junior', '高中': 'senior' };
  var CACHE_NAME = 'english-vocab-v1';

  // 沒有例句的條目，網站會顯示「來源註記」。這些註記可由 moe1200_no / ceec_level 推得，所以資料集不另存。
  function noteOf(e) {
    return e.moe1200_no != null
      ? '教育部基本 1,200 字表第 ' + e.moe1200_no + ' 字'
      : '大考中心高中英文參考詞彙表 第 ' + e.ceec_level + ' 級';
  }

  // 資料集條目 → 網站 KB 條目（id 不變，所以使用者原本的學習進度仍然對得上）
  function toKBEntry(e) {
    var k = { id: e.id, s: 'evoc', t: e.word, d: e.definition_zh, x: e.example != null ? e.example : noteOf(e), pos: e.pos };
    if (e.level !== '高中') k.stg = e.level;           // 網站把「沒有 stg」視為高中
    if (e.grade != null) k.gd = e.grade;
    if (e.category != null) k.cat = e.category;
    if (e.moe1200_no != null) k.n1200 = e.moe1200_no;
    if (e.ceec_level != null) k.hl = e.ceec_level;
    if (e.has_definition && e.example == null) k.nt = 1; // nt：x 只是註記、不是例句
    if (!e.has_definition) k.ng = 1;                     // ng：尚未加入中文詞義
    return k;
  }

  // 回傳 { kb, hsx }：kb 是有詞義的條目（放進 KB），hsx 是尚未加詞義的條目（網站另外放在 window.HSX）
  function toKB(entries) {
    var kb = [], hsx = [];
    for (var i = 0; i < entries.length; i++) {
      var k = toKBEntry(entries[i]);
      (k.ng ? hsx : kb).push(k);
    }
    return { kb: kb, hsx: hsx };
  }

  function withTimeout(ms) {
    if (typeof AbortController === 'undefined') return { signal: undefined, done: function () {} };
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms);
    return { signal: c.signal, done: function () { clearTimeout(t); } };
  }

  // 網路優先；失敗時改用上次成功的副本（Cache Storage，需要 https 或 localhost），離線也能用
  function getJson(url, timeoutMs) {
    var hasCache = typeof caches !== 'undefined';
    var tm = withTimeout(timeoutMs);
    return fetch(url, { signal: tm.signal })
      .then(function (res) {
        tm.done();
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
        if (hasCache) { var copy = res.clone(); caches.open(CACHE_NAME).then(function (c) { return c.put(url, copy); }).catch(function () {}); }
        return res.json();
      })
      .catch(function (netErr) {
        tm.done();
        if (!hasCache) throw netErr;
        return caches.open(CACHE_NAME).then(function (c) { return c.match(url); }).then(function (hit) {
          if (!hit) throw netErr;
          return hit.json();
        });
      });
  }

  /**
   * 載入條目。
   * opts.base       資料夾網址（結尾要有 /），預設 jsDelivr
   * opts.levels     只載入部分年級，例如 ['國小','國中']（會讀 levels/*.json，檔案較小）；省略則讀 vocab.json
   * opts.timeoutMs  單一請求逾時，預設 8000
   */
  function load(opts) {
    opts = opts || {};
    var base = opts.base || DEFAULT_BASE, ms = opts.timeoutMs || 8000;
    if (base.slice(-1) !== '/') base += '/';
    var urls = opts.levels && opts.levels.length
      ? opts.levels.map(function (l) {
          if (!LEVEL_FILE[l]) throw new Error('未知的年級：' + l);
          return base + 'levels/' + LEVEL_FILE[l] + '.json';
        })
      : [base + 'vocab.json'];
    return Promise.all(urls.map(function (u) { return getJson(u, ms); })).then(function (parts) {
      var all = [].concat.apply([], parts);
      if (!Array.isArray(all) || !all.length) throw new Error('單字資料集是空的或格式不對');
      return all;
    });
  }

  /**
   * 載入並放進網站的 KB（會先移除 KB 裡既有的 s==='evoc' 條目，避免重複），
   * 同時把尚未加詞義的條目放進 window.HSX（原地更新，網站既有的參照仍然有效）。
   * 回傳 Promise<有詞義的條目數>。
   */
  function install(KB, opts) {
    return load(opts).then(function (entries) {
      var r = toKB(entries);
      for (var i = KB.length - 1; i >= 0; i--) if (KB[i].s === 'evoc') KB.splice(i, 1);
      Array.prototype.push.apply(KB, r.kb);
      if (typeof window !== 'undefined') {
        if (!Array.isArray(window.HSX)) window.HSX = [];
        window.HSX.length = 0;
        Array.prototype.push.apply(window.HSX, r.hsx);
      }
      return r.kb.length;
    });
  }

  return { DEFAULT_BASE: DEFAULT_BASE, load: load, install: install, toKB: toKB, toKBEntry: toKBEntry, noteOf: noteOf };
});
