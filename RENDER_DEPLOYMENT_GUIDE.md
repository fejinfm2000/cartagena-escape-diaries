# 🏴‍☠️ Cartagena: Escape Diaries — Free Cloud Server Deployment Guide

This guide walks you through deploying your Node.js WebSocket game server to **Render.com** (100% free tier) in under 2 minutes, so anyone worldwide can play online multiplayer through your Netlify link.

---

## ⚡ 1-Click / Fast Setup via Render.com

### Step 1: Create a Free Render Account
1. Go to [https://render.com](https://render.com) and click **Sign Up** (or Log In using your **GitHub account**).

### Step 2: Create a New Web Service
1. In your Render Dashboard, click the blue **New +** button in the top right.
2. Select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Select your repository: `cartagena-escape-diaries` (or `fejinfm2000/cartagena-escape-diaries`).
   *(If it's not listed, click "Configure GitHub App" to give Render access to this repository).*

### Step 3: Configure Settings (Mostly Automatic!)
Render will detect `render.yaml` or you can verify the fields:
* **Name:** `cartagena-escape-diaries-server` (or any name you like)
* **Region:** Any (e.g. Frankfurt, Oregon, Singapore)
* **Branch:** `main`
* **Runtime:** `Node`
* **Build Command:** `npm install`
* **Start Command:** `npm start`
* **Instance Type:** `Free` ($0/month)
* **Health Check Path:** `/health`

Click **Deploy Web Service** at the bottom!

---

### Step 4: Copy Your Live Server URL
1. Wait ~60 seconds for Render to build and start your server.
2. Once the status shows **Live 🟢**, copy the URL at the top of your Render dashboard.  
   *(Example: `https://cartagena-escape-diaries-server.onrender.com`)*

---

### Step 5: Connect It to Your Live Netlify Game!

You can connect your new server in **either of two easy ways**:

#### Option A: Directly from the Web Page (No code change needed!)
1. Open your game: [cartagena-escape-diaries.netlify.app](https://cartagena-escape-diaries.netlify.app)
2. On the main page, click the **⚙️ Cloud Server** link (next to "Server Status").
3. Paste your Render URL (e.g. `https://cartagena-escape-diaries-server.onrender.com`).
4. Click **⚡ Test Connection** (it will verify with green checkmark).
5. Click **💾 Save & Connect**!

#### Option B: Set Default for All Visitors (`public/env-config.js`)
To make this server the automatic default for everyone visiting your site without them needing to enter anything:
1. Open `public/env-config.js`.
2. Change line 1 to your Render URL:
   ```javascript
   window.__ENV__ = { BACKEND_URL: 'https://cartagena-escape-diaries-server.onrender.com' };
   ```
3. Commit and push to Git (`git push origin main`). Netlify will redeploy automatically!

---

## ⚓ Testing Online Multiplayer
1. Open [https://cartagena-escape-diaries.netlify.app](https://cartagena-escape-diaries.netlify.app) on your phone or computer.
2. Click **⚔️ Create Online Room (Host)**, type your name, and click Create.
3. You will enter the **Lobby** and receive a 4-letter Room Code (e.g. `CART-1234`).
4. On a friend's phone or a second browser window, open the same site, click **🗝️ Join With Code**, enter the room code, and click Join.
5. Both players will appear in the lobby! The host clicks **Cast Off** to start the game!

> **Note on Free Render Servers**: Free Render web services spin down after 15 minutes of inactivity to conserve resources. When a player connects after a period of inactivity, the server may take ~30-40 seconds to wake up. Once awake, gameplay and WebSockets are instant and low latency!
