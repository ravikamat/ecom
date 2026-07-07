# ECO Command Center v2 (Solo Edition)

A complete, standalone E-Commerce research and management dashboard designed for solo entrepreneurs. ECO Command Center acts as a centralized brain for discovering trending products, analyzing competitors, sourcing suppliers, calculating true costs, and organizing your potential winning products.

## 🚀 Key Features

### 1. 📈 Live Trending Products & Deep Research
- **Live Scraping**: Aggregates trending products in real-time.
- **Deep Research Loop**: Utilizes an AI ↔ Scraper feedback loop to continuously refine searches, find niche gaps, and identify the highest potential products.
- **Smart Scoring**: Automatically calculates a "Winner Score" based on demand, margins, competition, and velocity.
- **Multi-page Infinite Scroll**: Seamlessly load hundreds of trending products with background pre-fetching.

### 2. 🔍 Product Search & Price Comparison
- Searches across multiple global platforms (Amazon, eBay, Walmart, AliExpress, etc.).
- Compares prices dynamically, converting currencies automatically based on your selected global region.
- Displays competition levels and potential profit margins instantly.

### 3. 🏭 Supplier Finder
- Automatically searches directories (like Alibaba, IndiaMart, Global Sources) for product matches.
- Suggests MOQs (Minimum Order Quantities) and estimates unit prices.

### 4. 🧮 Advanced Cost & Profit Calculator
- **True Cost Simulator**: Accounts for product cost, inward shipping, outward shipping, packaging, platform fees, payment gateway fees, return reserves, and miscellaneous expenses.
- **Tax Engine**: Calculates exact GST/Tax margins dynamically.
- **Break-Even Analysis**: Generates ROAS, ROI, and break-even points before you spend a dime.

### 5. 🤖 Integrated Dual AI Chatbot
- **NVIDIA NIM Integration**: Uses `z-ai/glm-5.2` as the primary reasoning model for data extraction, research, and insights.
- **Auto-Fallback System**: Automatically switches to `minimaxai/minimax-m3` if the primary AI hits rate limits or goes offline, ensuring zero downtime.
- **Rich Result Cards**: The chatbot can search for products and render rich UI cards and price comparison tables directly in the chat window.

### 6. 📁 Saved Products Database
- One-click save for any product.
- Highlights (`✓ Saved`) products already in your database across the app to prevent duplicates.
- Local SQLite persistence means your data stays private and secure.

---

## 📂 Codebase Architecture & File Structure

The project uses a lightweight, dependency-free frontend communicating with an Express.js/SQLite backend. 

### Backend (Server)
* **`server.js`** (2,300+ lines): The monolithic backend controller. Handles static file serving, SQLite database initialization, API routing, web scraping (Crawlee/Puppeteer), AI orchestration (NVIDIA NIM APIs), and the Deep Research feedback loop.
* **`db/sqlite.js`**: Database schema and connection logic for the persistent SQLite database (`eco.db`). Stores application settings (like API keys) and saved products.

### Frontend (Client-Side Logic)
All frontend scripts are located in the `/js/` directory:
* **`app.js`**: Core initialization, routing logic, navigation bar handling, theme switching, and Settings Modal logic (Dual API keys).
* **`trending.js`**: Handles the trending product UI, infinite scroll (`IntersectionObserver`), live saving, and triggering the Deep Research endpoint.
* **`search.js`**: Manages the multi-platform search functionality and price comparison UI.
* **`dashboard.js`**: Computes global statistics (total products, average margins) and renders the overview dashboard charts/metrics.
* **`calculator.js`**: The complex financial logic. Computes True Cost, Return Reserve, ROI, and break-even metrics dynamically as inputs change.
* **`saved.js`**: Fetches, renders, and manages CRUD operations for the user's saved product database.
* **`chatbot.js`**: The frontend AI interface. Supports streaming Server-Sent Events (SSE) and renders rich HTML cards for tool results.
* **`db.js`**: Legacy Dexie.js local database wrapper (mostly deprecated in favor of server-side SQLite, acts as a local proxy where needed).
* **`ai-engine.js`**: Client-side AI utility functions.
* **`competitor-tracker.js`**: Tracks competitor pricing and generates pricing strategies.
* **`suppliers.js`**: Handles the supplier search UI and logic.

### Styling & Layout
* **`index.html`**: The single-page application (SPA) layout containing all section containers, modals, and navigation elements.
* **`css/styles.css`**: A premium, unified dark-theme design system using CSS variables. Contains all styling for layout, typography, animations, buttons, and rich chat cards.

---

## ⚙️ Configuration & Setup

1. **Install Node.js**: Ensure Node.js (v18+) is installed.
2. **Install Dependencies**: Run `npm install` in the root directory.
3. **Start Server**: Run `node server.js` to start the backend on port 3000.
4. **Access the App**: Open `http://localhost:3000` in your browser.
5. **Set API Keys**: 
   - Click the **Settings (⚙️)** icon in the top right.
   - Enter your NVIDIA NIM API key for **GLM-5.2** (Primary).
   - Enter your NVIDIA NIM API key for **MiniMax-M3** (Fallback).
   - Click Save. Keys are securely stored in the local SQLite database.

## 🛡️ Privacy & Data
ECO Command Center is built for solo operators. There is no cloud telemetry, no user tracking, and no external database. All your saved products, settings, and research logs reside locally on your machine in `eco.db`.
