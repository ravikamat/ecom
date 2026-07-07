# 🤖 NVIDIA API Key Setup Guide

## Quick Start

The ECO platform now supports **optional AI features** powered by NVIDIA's z-ai/glm-5.2 model. You can:
- Use **100% free web scraping** without any API key (fully functional!)
- Enable **AI market intelligence** by adding a NVIDIA API key

---

## How to Get a NVIDIA API Key

1. **Visit** → [build.nvidia.com](https://build.nvidia.com)
2. **Sign up** (free account)
3. **Navigate** → API Keys (left sidebar)
4. **Click** → "Generate New API Key"
5. **Copy** → The key starts with `nvapi-`

> The first key is **free forever** with 10,000 API calls/month quota

---

## How to Save the API Key in ECO

### Method 1: Via Settings Button (Recommended)

1. **Open** → `http://localhost:3000`
2. **Click** → ⚙️ Settings button (top right)
3. **Paste** → Your `nvapi-xxxxxxx` key into the text field
4. **Click** → "Test" (optional - validates the key)
5. **Click** → "Save"
6. ✅ **Done!** AI features are now active

### Method 2: Via Environment Variable

```bash
# On Windows (PowerShell):
$env:NVIDIA_API_KEY = "nvapi-your-key-here"
node server.js

# Or create a .env file:
# NVIDIA_API_KEY=nvapi-your-key-here
```

### Method 3: Database Persistence

Once saved via the Settings button, the key is stored in `eco.db` and automatically loaded on server restart.

---

## Where the API Key is Stored

| Location | Purpose | Persistence |
|----------|---------|-------------|
| **eco.db (SQLite)** | Primary storage | ✅ Persists across restarts |
| **Browser localStorage** | UI convenience | ✅ Survives browser refresh |
| **Environment variable** | Runtime override | ❌ Lost on restart (unless set in shell) |

---

## Features That Require the API Key

### 🟢 Available WITHOUT API Key
- ✅ Web scraping (Amazon, Google Shopping, Flipkart, eBay)
- ✅ Price comparison across platforms
- ✅ Live product listings
- ✅ Search & filtering
- ✅ Saved items & calculator
- ✅ Dashboard & metrics

### 🔵 Available WITH API Key
- 🤖 AI Market Intelligence (demand scores, profit margins, competitor analysis)
- 📊 AI-generated product recommendations
- 📈 Market trend analysis
- 💡 Seasonal demand forecasting
- 🎯 Best platform recommendations per product

---

## Testing Your API Key

### In the UI

1. Open Settings (⚙️)
2. Paste your key
3. Click **"Test"** button
4. Wait for response:
   - ✅ **Green**: Key is valid and active
   - ❌ **Red**: Key is invalid or quota exceeded

### Via Terminal/PowerShell

```powershell
# Test if AI is responding
Invoke-WebRequest -Uri "http://localhost:3000/api/health" | ConvertFrom-Json

# Should show:
# "status": "ok" or "degraded"
# If AI is enabled, you'll see enhanced features in searches
```

---

## Troubleshooting

### "AI service not configured"
- You haven't set an API key yet
- **Solution**: Go to Settings (⚙️) and add your NVIDIA key

### "Key rejected by NVIDIA API"
- The key is invalid or quota is exceeded
- **Solution**: 
  1. Check the key starts with `nvapi-`
  2. Visit [build.nvidia.com](https://build.nvidia.com) to verify the key
  3. Check your monthly quota usage

### "AI timeout"
- NVIDIA API is slow or unreachable
- **Solution**: 
  - Retry the search (it will timeout gracefully and use web scraping only)
  - Check your internet connection
  - Restart the server

### Settings button doesn't appear
- Make sure you're using the latest version of the frontend
- **Solution**: Hard refresh browser (`Ctrl+F5` or `Cmd+Shift+R`)

---

## Advanced: Environment Override

If you want to always use a specific API key without saving it to the database:

```bash
# PowerShell
$env:NVIDIA_API_KEY = "nvapi-xxxx"
node server.js

# Bash/Linux
export NVIDIA_API_KEY="nvapi-xxxx"
node server.js
```

The environment variable **always takes precedence** over the database value.

---

## Security Notes

🔒 **Best Practices**:
- Never commit your API key to Git
- Don't share your key in Discord/Slack/GitHub Issues
- Keep your `.env` file in `.gitignore`
- Rotate keys if they're accidentally exposed
- Monitor your [NVIDIA quota](https://build.nvidia.com) regularly

---

## What Happens Without the API Key?

✅ **The platform works perfectly!**
- All web scraping features continue to work
- Searches are just as fast
- You get real live pricing data
- The only difference: No AI market intelligence overlay

Think of it as: **Web scraping is the core, AI is the enhancement.**

---

## Support

If you have issues:
1. Check this guide (you're reading it! 📖)
2. Check `/api/health` endpoint
3. Check `/api/logs` for error messages
4. Restart the server: `node server.js`

---

**Happy selling! 🚀**
