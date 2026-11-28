# english-vocab｜國小・國中・高中英文單字資料集

從「108課綱跨學科學習系統」獨立出來的英文單字資料，放在 GitHub 上讓網站（或任何程式）直接讀取。

| 項目 | 數量 |
|---|---|
| 全部條目 | 6,127 |
| 有中文詞義 | 4,567（國小 400、國中 801、高中 3,366） |
| 尚未加詞義 | 1,560（全為高中；大考中心字表中還沒補詞義的字） |
| 有例句 | 2,195（國小、國中全部；高中 994） |
| 需人工檢查 | 4（見「已知問題」） |

來源（依網站原始碼註解）：教育部國中小基本英語字彙 1,200 字、大考中心《高中英文參考詞彙表》（111 學年度起適用）。

## 檔案

```
data/
  vocab.json          完整資料（唯一的「真實來源」，一行一筆，方便看 git diff）
  vocab.csv           同內容，UTF-8 含 BOM，Excel 直接開
  levels/             依年級拆開，網站只需要部分年級時用
    elementary.json   國小 400
    junior.json       國中 801
    senior.json       高中 4,926
  manifest.json       版本、各項數量、每個檔案的 sha256
loader/vocab-loader.js   給網站用的載入器（無相依）
scripts/build.mjs        驗證 vocab.json，並重新產生 csv / levels / manifest
scripts/test.mjs         載入器測試
scripts/extract-from-index.mjs   一次性：從舊版 index.html 重建 vocab.json（留作來源紀錄）
```

`csv`、`levels/*`、`manifest.json` 都是由 `vocab.json` 產生的，**只改 `vocab.json`**，再跑 `npm run build`。

## 欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 穩定的 id，與網站原本相同（例如 `evoc2006`），所以使用者已存的學習進度不會失效。**不要改已發布的 id。** |
| `word` | string | 單字。有替代寫法時用 ` / ` 分開，例如 `a / an`、`café / cafe` |
| `pos` | string | 網站用的主要詞性分類：`n` 名詞、`v` 動詞、`a` 形容詞、`d` 副詞、`p` 介系詞、`c` 連接詞、`r` 代名詞與限定詞（含冠詞）、`m` 數詞、`q` 疑問詞、`x` 助動詞、`i` 招呼與感嘆 |
| `definition_zh` | string | 中文詞義，開頭帶詞性縮寫，如 `n. 母親`。尚未加詞義時為空字串 |
| `example` | string \| null | 例句；沒有則為 `null` |
| `level` | string | `國小`／`國中`／`高中` |
| `grade` | int \| null | 只有部分國小、國中條目有（3、5、7） |
| `category` | string \| null | 主題或分組，例如 `顏色與家人`、`不規則動詞`、`基本1200` |
| `moe1200_no` | int \| null | 在教育部 1,200 字表中的編號（1–1200） |
| `ceec_level` | int \| null | 大考中心字表的級別（1–6） |
| `has_definition` | boolean | 是否已有中文詞義 |
| `needs_review` | true（僅有問題時出現） | 資料疑似剪貼錯誤，待人工修正 |

## 使用方式

### 1. 直接用網址讀（任何語言）

repo 建好後（建議名稱 `english-vocab`），並建立標籤 `v1.0.0`：

```
https://cdn.jsdelivr.net/gh/wengchiehyun-cell/english-vocab@1/data/vocab.json
https://raw.githubusercontent.com/wengchiehyun-cell/english-vocab/main/data/vocab.json
https://wengchiehyun-cell.github.io/english-vocab/data/vocab.json   （啟用 GitHub Pages 後）
```

- 想要穩定：用 jsDelivr 並固定標籤（`@1.0.0`）。`@1` 會跟著最新的 1.x.x，`@main` 則有 CDN 快取延遲。
- 這三種網址我都沒有實際連過（repo 還不存在），第一次上線後請先用瀏覽器打開確認。

```js
const words = await (await fetch(URL)).json();
const done = words.filter(w => w.has_definition && w.level === '國中');
```

```python
import pandas as pd
df = pd.read_json(URL)            # 或 pd.read_csv(".../vocab.csv")
```

### 2. 接回學習網站

載入器會把資料轉回網站原本的 `KB` 條目格式（id、欄位、`stg`／`nt`／`ng` 等都還原），並把「尚未加詞義」的條目放進 `window.HSX`。我用網站原始碼產生的 4,567 + 1,560 筆條目逐筆比對，結果完全一致。

在 `index.html` 裡：

1. 刪掉兩段內嵌的單字資料（以你上傳的版本為例）：
   - 第 569–637 行的 `A('evoc',[ … ]);`
   - 第 2405–14712 行整個 `<script> … </script>`（從 `/* ===== 分級單字` 開始的那一大段，裡面只有單字資料與合併邏輯）
2. 在原處加入：

```html
<script src="https://cdn.jsdelivr.net/gh/wengchiehyun-cell/english-vocab@1/loader/vocab-loader.js"></script>
<script>
  VocabDataset.install(KB)            // 只要部分年級：install(KB, { levels: ['國小','國中'] })
    .then(function () { stats(); })   // 重新計算首頁的已掌握／待複習數字
    .catch(function (e) { console.warn('單字資料載入失敗', e); });
</script>
```

**這個改法我沒有在瀏覽器裡實際跑過**，上線前請測以下幾點：

- 單字改成非同步載入，載入完成前首頁的知識點總數與單字進度會偏少。`stats()` 會重算這些數字（包含首頁的「共 N 個知識點」），所以載入完成後要呼叫一次，如上面的範例。
- 網站的「匯入備份」會用目前 `KB` 的 id 過濾進度（第 2247 行）。如果使用者在單字載入完成前就匯入，單字的進度會被當成不存在而丟掉。建議載入完成前先停用匯入按鈕。
- 載入器是「網路優先、失敗時用上次的快取副本」（Cache Storage，需 https），所以離線仍可使用，但**第一次**必須連得上網。
- 若想維持網站離線完整、不依賴 CDN，另一條路是在部署時由 `vocab.json` 重新產生內嵌區塊，而不是執行期載入。需要的話可以再做這支腳本。

## 維護流程

```bash
# 修改 data/vocab.json（一行一筆）
npm run build      # 驗證並重新產生 csv / levels / manifest
npm test
git commit -am "補上 xxx 的詞義" && git tag v1.0.1 && git push --follow-tags
```

`npm run build` 會檢查：id 不重複、`pos`／`level` 合法、`has_definition` 與 `definition_zh` 一致、沒有詞義就不能有例句、`moe1200_no` 剛好 1–1200 各一筆。需要 Node 18 以上，不需 `npm install`。

## 已知問題

- **4 筆資料疑似從字表剪貼時出錯**（已標 `needs_review`，沒有擅自修改）：`theirs, themselves)`、`yourself, yourselves)`、`calm v. / adj. / n camel`（兩個字黏在一起）、`neither adj. / adv. / pron. / `。
- **1,560 筆沒有中文詞義**（`has_definition: false`），全是大考中心 5、6 級字。
- **高中有詞義的 3,366 字中，只有 994 筆有例句**，其餘 2,372 筆 `example` 為 `null`。
- `pos` 每字只存一個主要詞性；多詞性的字（如 `act`）其他詞性只寫在 `definition_zh` 裡。
- 少數詞義看起來被截斷（例如 `add` 的「補充說」），我沒有逐筆校對全部內容。

## 授權

尚未指定，發布前請自行決定。字表本身來自教育部與大考中心，詞義與例句的著作權歸屬與可再散布的範圍，請先確認再選授權條款。
