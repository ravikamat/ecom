# ECO Command Center v2 (Solo Edition)

A highly advanced, standalone E-Commerce research, analysis, and management platform engineered specifically for solo entrepreneurs. ECO Command Center acts as a centralized intelligence hub—integrating live market data, AI-driven insights, multi-platform product sourcing, and granular financial forecasting.

---

## 🌟 Comprehensive Feature Breakdown

### 1. 📈 Live Trending Products & Deep Research Intelligence
- **Live Aggregation**: Real-time extraction of trending products tailored to specific categories and global regions.
- **Deep Research Loop (AI ↔ Scraper)**: 
  - **Round 1 (Initial Scrape)**: Gathers baseline market trends.
  - **Round 2 (AI Analysis)**: An integrated NVIDIA NIM AI analyzes the raw scrape, identifies market gaps, and formulates targeted sub-queries to uncover untapped niches.
  - **Round 3 (Targeted Scrape & Scoring)**: Re-scrapes the market based on AI feedback, aggregates the data, and ranks products to find hidden winners.
- **Winner Score Algorithm**: Automatically computes a proprietary score out of 100 based on:
  - **Demand Volume**: Normalized search frequency and market interest.
  - **Profit Margin**: Sourced via backend estimates matching average retail vs. wholesale costs.
  - **Competition Level**: Inversely weighted against market saturation.
- **Dynamic Flagging**: Instantly identifies and visually flags (`✓ Saved`) products that already exist in your local SQLite database using fuzzy string matching to prevent duplicate research.
- **Infinite Scrolling & Pre-fetching**: Implements `IntersectionObserver` to trigger seamless pagination, fetching and rendering hundreds of products without blocking the main UI thread.

### 2. 🔍 Global Product Search & Dynamic Price Comparison
- **Multi-Platform Engine**: Broadcasts search queries across Amazon, eBay, Walmart, AliExpress, and 15+ region-specific platforms (e.g., Flipkart for India, Mercado Libre for LATAM).
- **Intelligent Currency Conversion**: Automatically detects the user's selected region and converts all scraped pricing into the localized display currency using live-cached exchange rates.
- **Comparative Data Tables**: Automatically aggregates identical or similar products across platforms, laying out pricing, stock availability, and seller ratings side-by-side for instant arbitrage identification.

### 3. 🏭 Intelligent Supplier Sourcing
- **Automated Directory Matching**: Pings B2B directories (Alibaba, IndiaMart, Global Sources, ThomasNet) utilizing natural language processing to match retail products to wholesale manufacturers.
- **Negotiation Prep**: Extracts Minimum Order Quantities (MOQs), factory certifications, and tiered wholesale pricing to prepare you for supplier outreach.

### 4. 🧮 Granular Financial Modeling (True Cost Simulator)
- **Holistic Cost Calculation**: Goes far beyond simple retail minus wholesale. Dynamically calculates:
  - Base Unit Cost & Inward Shipping (Factory to 3PL).
  - Outward Shipping (3PL to Customer) & Packaging Costs.
  - Platform Commission Fees & Payment Gateway Transaction Fees.
  - **Return Reserves**: Automatically sets aside capital based on historical category return rates.
  - Custom Miscellaneous inputs.
- **Tax Engine Integration**: Auto-calculates exact tax margins (e.g., GST splits for India, VAT for UK/EU, Sales Tax for USA) based on dynamic backend configurations.
- **Predictive Break-Even**: Outputs real-time Return on Ad Spend (ROAS) targets, Return on Investment (ROI) percentages, and unit break-even thresholds.

### 5. 🤖 Dual-Node AI Chatbot System
- **Primary Brain**: Powered by NVIDIA's `z-ai/glm-5.2`, delivering deep reasoning, data extraction, and strategic business advice.
- **Zero-Downtime Fallback**: Automatically cascades to `minimaxai/minimax-m3` if the primary model encounters rate limits, timeouts, or 503 errors.
- **Rich Interactive UI**: The chatbot does not just return text. Through custom `tool_result` event handlers, the AI can trigger scraping tasks and render:
  - **Product Cards**: Visual cards with images, prices, ratings, and tags.
  - **Comparison Tables**: Formatted HTML tables comparing platform arbitrage opportunities directly inside the chat flow.

### 6. 📁 Secure Local Database (SQLite)
- **Privacy First**: Zero cloud telemetry. All data is persisted locally via SQLite.
- **One-Click Save**: Instantly save products, supplier contacts, and financial models from any tab.
- **Centralized Settings**: API keys and app configurations are securely stored and injected into the backend at runtime.

---

## 📂 Deep Dive: Codebase Architecture & File Structure

The platform is structured as a monolithic Node.js backend serving a lightweight, dependency-free vanilla JavaScript frontend.

### 🖥️ Backend Architecture
- **`server.js`** *(2,300+ lines)*: The heart of the application. 
  - **Central `CONFIG`**: Manages all caching TTLs, rate limits (via sliding window), and request timeouts.
  - **API Routing**: Exposes RESTful endpoints (`/api/trending/page`, `/api/ai-status`, `/api/db/settings`).
  - **Deep Research Controller**: Orchestrates the multi-round AI and web scraper feedback loop.
  - **AI Shim**: Manages HTTP requests to the NVIDIA NIM endpoint, parsing SSE streams, executing server-side tool calls, and handling the auto-fallback logic.
- **`db/sqlite.js`**: 
  - Uses `better-sqlite3` (or equivalent synchronous driver) to initialize the `eco.db` file.
  - Defines schemas for `Settings` (key-value pairs) and `SavedItems`.
  - Exposes CRUD operations directly to `server.js`.

### 🌐 Frontend Architecture (Client-Side Logic)
Located exclusively in the `/js/` directory to ensure strict separation of concerns.

- **`app.js`**: 
  - **Initialization**: Bootstraps the application, restoring user sessions, themes, and global currency states.
  - **Routing**: Manages the SPA view transitions (hiding/showing sections based on Top Bar navigation).
  - **Settings Management**: Interacts with `/api/db/settings` to securely load, save, and test the Dual API Keys for GLM-5.2 and MiniMax-M3.
- **`trending.js`**: 
  - **Rendering**: Maps JSON arrays of products into dynamic HTML table rows.
  - **State Management**: Maintains `_trendPage`, `_trendListings`, and pre-fetch caching dictionaries.
  - **IntersectionObserver**: Attaches to the `#trend-loading-trigger` to automatically request subsequent pages before the user reaches the bottom.
  - **Fuzzy Flagging**: Uses `_isProductSaved()` to cross-reference rendered products against a normalized, memory-cached Set of saved database items.
- **`search.js`**: 
  - Handles the complex multi-platform query string builder.
  - Parses cross-origin JSON responses (proxied through the backend) to construct price comparison tables.
- **`dashboard.js`**: 
  - Ingests aggregated statistics from the backend.
  - Utilizes null coalescing and dynamic date functions to render resilient charting data (e.g., Average Margins, Saved Product counts).
- **`calculator.js`**: 
  - Contains the proprietary `FinancialEngine` logic.
  - Listens for `input` events on dozens of DOM elements to recalculate and mutate the DOM in real-time, delivering instant visual feedback on profitability.
- **`saved.js`**: 
  - Acts as the presentation layer for the SQLite database.
  - Implements sorting, filtering, and deleting of bookmarked items.
- **`chatbot.js`**: 
  - Connects to the backend via Server-Sent Events (SSE).
  - Parses incoming JSON streams into typing indicators, raw text, and rich HTML widgets (via the `_renderToolResult()` function).
- **`db.js`**: 
  - A legacy wrapper originally used for Dexie.js (IndexedDB). Now refactored to act as an asynchronous HTTP client proxy to the new SQLite REST endpoints, ensuring backward compatibility with older UI components.
- **`ai-engine.js`**: 
  - Client-side helper methods for formatting chat histories and separating `system` vs `user` prompt roles before transmission to the server.
- **`competitor-tracker.js` & `suppliers.js`**: 
  - Specialized modules dedicated to evaluating competitor pricing elasticity and rendering B2B supplier contact cards.

### 🎨 Styling & DOM Layout
- **`index.html`**: 
  - The master structural template. Contains all `<section>` wrappers for the SPA, the global Top Bar, the Settings Modal, and the Floating Chat widget.
- **`css/styles.css`**: 
  - Built on a robust CSS Variable design system.
  - Implements a premium dark mode, glassmorphism UI elements, shimmer loading states (`#btn-deep-research`), status indicator dots (`.status-dot.green/red`), and responsive flexbox/grid layouts.

---

## ⚙️ Installation & Operation Guide

### Prerequisites
- **Node.js**: Version 18.x or higher required.
- **NVIDIA Developer Account**: Required to generate API keys for the AI endpoints.

### Step-by-Step Setup
1. **Clone & Install**:
   ```bash
   git clone https://github.com/ravikamat/ecom.git
   cd ecom
   npm install
   ```
2. **Launch the Core Server**:
   ```bash
   node server.js
   ```
   *The server will automatically generate the `eco.db` SQLite database if it does not exist.*
3. **Initialize the UI**:
   - Open your preferred Chromium-based browser (Chrome, Edge, Brave).
   - Navigate to `http://localhost:3000`.
4. **Configure the AI Engines**:
   - Click the **Gear Icon (⚙️)** in the top right navigation bar to open Settings.
   - **Primary Key**: Input your NVIDIA API key for `z-ai/glm-5.2`.
   - **Fallback Key**: Input a secondary key (or the same key) for `minimaxai/minimax-m3`.
   - Click **Save**. The backend will instantly validate the tokens.
5. **Set Market Context**:
   - Use the dropdowns in the Top Bar to select your target Country and Display Currency. This globally impacts all tax calculations, pricing formats, and supplier algorithms.

## 🛡️ Security & Privacy Notice
ECO Command Center is deliberately architected without any centralized cloud database. 
- **API Keys**: Never stored in `localStorage` or transmitted to third-party tracking services. They remain locked inside the local backend SQLite database.
- **Web Scraping**: Handled entirely server-side to bypass CORS and prevent IP leaking via client-side requests.
- **Data Ownership**: You have absolute sovereignty over your saved supplier lists, financial models, and trending analysis.
