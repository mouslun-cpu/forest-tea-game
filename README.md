# 森林手搖店

手機闖關式集成學習教學遊戲：決策樹 → Bagging → 隨機森林 → AdaBoost。老師建立房間、投影 QR，學生以暱稱加入，各自建樹與提出接力規則。

## 在這台電腦試玩

需要 Node.js 24 與 npm。在本資料夾執行：

```powershell
npm install
npm run dev
```

開啟 http://localhost:3100 。點「我是老師」建立房間；勾選「加入 6 位示範店長」可單人走完教師流程。要體驗學生操作，另開加入頁，以房間碼加入。示範店長永遠標示為示範，不冒充學生。

學生手機需與電腦處於可互通的網路。教師請使用 `http://電腦區網IP:3100` 開啟網站，或在 QR 下方更新學生可連線的網址。`localhost` 僅限這台電腦，手機無法使用。教室 Wi-Fi 若隔離裝置，需改用公開部署；防火牆是否允許連線須實機確認。

教師憑證與學生身分分別存在原瀏覽器 localStorage。重新整理會恢復；無痕視窗關閉或清除網站資料後不會恢復。教師投影 `/display/房間碼` 沒有控制權。QR 網址設定會在同源的教師與投影分頁同步。

## 已實作

- 四個任務、25／40 分鐘節奏、教師倒數／暫停／加時、收件與揭曉分開。
- 24 張模擬訓練訂單，有放回抽樣與重複次數計入學習。
- 最多兩層手作決策樹，每節點隨機候選線索；無法分岔時停止。
- 三輪 AdaBoost，錯題相對增重、依最小加權錯誤選模型、加權合併。
- 獨立 12 張封存題，課堂手作與固定條件系統示範分開比較。
- 學生提案、店長進度、可選音效、概念題及畢業徽章。
- 老師提交名單、QR、獨立投影、CSV／Markdown 成果匯出。
- 身分／已交答案與草稿恢復；版本檢查避免跨輪提交及教師重送跳關。

## 儲存與 Firebase 要補什麼

**現在不用任何資料庫帳號就能試玩。** 預設由伺服器將房間存入 `.data/`；瀏覽器每 1.5 秒讀取狀態，重新啟動伺服器仍保留房間。這是單一 Node 程序的本機持久儲存，不能多個實例共用同一資料夾。

要改用 Firebase Realtime Database，請準備一個供本遊戲使用的專案，將以下兩項放到 `.env.local`（參考 `.env.example`），或正式主機的環境變數：

1. `FIREBASE_DATABASE_URL`：Realtime Database 的完整 URL。
2. `FIREBASE_SERVICE_ACCOUNT_JSON`：Firebase 專案設定 → 服務帳戶 → 產生新私密金鑰，將 JSON 設於伺服器環境。

服務帳戶金鑰是私密資料，請直接設定於本機／主機環境，不提交 Git，也不用貼在對話中。兩項要一起設定，重新啟動才會切換。套用 `database.rules.json` 禁止瀏覽器直接存取，資料透過伺服器 API 控制；因此不用前端 Firebase API key，也不用啟用匿名 Firebase Auth。本版使用伺服器產生的房間與學生隨機憑證，資料庫只存雜湊。

Firebase adapter 已實作，尚未取得專用憑證，**未做雲端實連驗證**。本機房間不會自動遷移到 Firebase。切換後請建立新房間。

房間 7 天後停止接受存取，但不自動抹除檔案。正式主機需配置資料保留排程，刪除 `.data/` 中 `createdAt` 超過 7 天的房間；Firebase 則清理 `forestTeaRooms` 下相同條件資料。使用本機儲存上雲時必須掛持久磁碟並維持單一 instance。

## 部署準備

```powershell
npm run build
npm start
```

預設服務埠 3100。提供 Dockerfile，可使用主機的 PORT 環境變數。正式公開課堂建議 Firebase，以免依賴單台電腦；部署後仍需用教室真機掃正式 QR 驗證。此專案目前未部署公開網址。

## 驗證指令

```powershell
npm test
npm run typecheck
npm run build
npx playwright test
```

E2E 預設連 `http://localhost:3100`，需先啟動服務；使用本機已安裝的 Google Chrome（headless）。可透過 `E2E_BASE_URL` 改位址。測試會建立獨立房間，不修改原教室。測試截圖位於 `artifacts/screenshots/`。測試憑證與原始資料不輸出到交付文件。

60 人同時提交測試只驗證伺服器寫入的一致性，並不代表已驗證 60 支真實手機、教室網路或 Firebase 延遲。實際課堂節奏與 iOS 真機仍須試教驗證。

## 教學界線

訂單均為合成資料，不代表真實消費者。手作樹由學生選問題，是演算法的操作體驗；系統示範另依 Gini 自動選分裂。分類以硬投票示範，部分現成套件採機率平均。Boosting 的錯題增重具體指 AdaBoost，非所有 Boosting 都使用同一更新式。成果由鎖定模型對共同封存題即時計算，不預設森林或 Boosting 一定勝出。

完整提案在 `docs/game-plan.md`；實作採原生 CSS 視覺系統及本機／Firebase server adapter，其餘教學目標沿用提案。
