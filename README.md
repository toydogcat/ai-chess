# 🌌 Cyber Chinese Chess & Banqi (賽博象棋與暗棋)

一個基於未來科幻、賽博朋克視覺風格設計的高端**象棋與暗棋**雙遊戲平台，內建高度智慧的 Minimax Alpha-Beta 剪枝 AI，並原生支援 **PWA (Progressive Web App)**，讓您可以直接安裝至行動裝置或桌面，享受完全離線的沉浸式遊玩體驗！

👉 **[立即在線遊玩 🎮](https://toydogcat.github.io/ai-chess/)**

---

## 🚀 核心功能與特色

- ⚔️ **雙重模式**：同時支持傳統「中國象棋」與趣味刺激的「暗棋（半棋）」。
- 🧠 **戰術級 AI 引擎**：內建極具挑戰性的 Minimax 與 Alpha-Beta 剪枝演算法 AI，實時計算最優步法。
- 🔮 **賽博朋克美學**：科幻霓虹、電路線條風格的精美棋盤與棋子設計，帶來極致視覺震撼。
- 🎵 **背景音樂**：預載充滿張力的戰鬥背景音樂，提供沉浸式的棋局對抗氛圍。
- 📱 **PWA 支援**：支援離線快取、全螢幕原生視圖，以及桌面與手機的「添加到主畫面」安裝。

---

## 🛠️ 本地開發與運行說明 (Development Setup)

若您想在本地端運行或修改本專案，請確保您的環境已安裝 [Node.js](https://nodejs.org/)。

### 1. 複製本專案 (Clone Project)
```bash
git clone https://github.com/toydogcat/ai-chess.git
cd ai-chess
```

### 2. 安裝依賴 (Install Dependencies)
```bash
npm install
```

### 3. 啟動本地開發伺服器 (Start Dev Server)
```bash
npm run dev
```
啟動後在瀏覽器打開網頁即可進行開發：
- 本地網址：`http://localhost:3000`

### 4. 專案編譯與 PWA 打包 (Production Build)
編譯專案並生成 PWA 相關靜態資源、Service Worker 緩存清單：
```bash
npm run build
```
編譯完成後，可以進行本地預覽：
```bash
npm run preview
```

---

## 📲 PWA 安裝指南 (PWA Installation Guide)

專案已整合 PWA 技術，不需下載應用程式商店即可在所有裝置上一鍵安裝！

### 💻 桌面端 (Desktop - Chrome / Edge)
1. 使用 Chrome 或 Microsoft Edge 瀏覽器打開 [線上網頁](https://toydogcat.github.io/ai-chess/)。
2. 點擊瀏覽器網址列右側出現的 **「安裝」圖示（帶有向下的箭頭）** 或右上角選單中的 **「安裝 Cyber Chinese Chess...」**。
3. 確認安裝後，應用程式將作為獨立視窗啟動，並在桌面上建立捷徑。

### 📱 Android 行動端 (Chrome)
1. 使用 Android 版 Google Chrome 打開網頁。
2. 網頁載入後，系統通常會於底部彈出 **「將 Cyber Chinese Chess 新增至主畫面」** 的提示。
3. 若未彈出提示，可點擊 Chrome 右上角的「三個點」選單，然後選擇 **「安裝應用程式」** 或 **「新增至主畫面」**。

### 🍏 iOS / iPhone 行動端 (Safari)
1. 使用 iPhone 自帶的 **Safari 瀏覽器** 打開網頁。
2. 點擊瀏覽器底部的 **「分享」按鈕**（向上箭頭方框）。
3. 在彈出的分享選單中向下滑動，選擇 **「加入主畫面 (Add to Home Screen)」**。
4. 點擊右上角「新增」，即可在主畫面上看見精美的賽博棋子圖示，點擊即可開啟全螢幕沉浸式遊戲。

---

## 📂 專案結構
- `src/` - 遊戲核心程式碼
  - `src/logic/` - 象棋及暗棋的遊戲規則引擎與 Minimax AI 計算邏輯
  - `src/App.tsx` - 遊戲首頁與 Cyber 主題 UI 介面
  - `src/main.tsx` - 主入口與 PWA Service Worker 註冊
- `public/` - 靜態資源（PWA 電子圖示、音效、背景音樂）
- `vite.config.ts` - Vite 建置設定及 PWA 自動快取設定
