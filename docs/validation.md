# 本機驗證紀錄

2026-09-07，Windows / Node.js 24.11.1 / Next.js 16.3.4。

- `npm test`：15 項通過。涵蓋抽樣、重複卡、森林逐節點停止、AdaBoost 手算權重／邊界、60 人並行加入及提交、教師重送不跳階段、權限、封存、重開、倒數及期限。
- `npm run build`：成功完成正式建置與 TypeScript 檢查。
- `npx playwright test`：一個完整 E2E 情境通過，實際操作教師＋兩個獨立 390×844 手機瀏覽器 context＋1920×1080 投影，四關與三輪 Boosting、重新整理身分及草稿、答案保密、CSV、概念題、結束拒絕新加入皆驗證。沒有 pageerror，各階段手機無橫向溢出。
- 已親眼檢視首頁、教師報到、學生建樹、第二輪 Boosting 與最終成果截圖。截圖見 `artifacts/screenshots/`。

測試中發現並修正：初次載入未完成 hydration 時按鈕會漏接點擊；Windows 原子 rename 偶發 EPERM，改有限重試；教師並行 advance 跳過階段，加入伺服器版本檢查；樹路徑遞迴高亮錯支；手作森林無法分裂時停止。

尚未驗證：Firebase 真實專案連線、公开主機部署、實體 Android／iPhone 掃碼與教室網路、60 支真實手機的效能及40分鐘教學節奏。60人服務測試不等同真機負載測試。

正式執行模式：透過 npm start 啟動 standalone server 後，再跑同一個完整 E2E，1 passed（34.4 秒）；本機對目前區網位址 192.168.9.211:3100 的 HTTP 請求回傳 200，尚不代表已用另一支實體手機驗證。
