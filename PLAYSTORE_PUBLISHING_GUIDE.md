# 📱 Google Play Store Publishing Guide: Cartagena Escape Diaries

This guide provides the complete, step-by-step roadmap to publish **Cartagena: Escape Diaries** on the **Google Play Store**.

---

## 🏗️ Architecture: Trusted Web Activity (TWA)

Google officially recommends **Trusted Web Activity (TWA)** for publishing modern web and WebSocket games to Google Play:
- **Zero Java/Kotlin rewrite needed**: Your existing HTML5, CSS3, ES Modules, and WebSocket backend power the game directly.
- **Micro-sized App Bundle**: The generated `.aab` file is lightweight (~1.5 MB to 3 MB).
- **Instant Live Updates**: Any bug fixes or board visual enhancements you push to your server update instantly on players' phones without needing to submit a new app update to Google Play.
- **Native Fullscreen Experience**: With Digital Asset Links verified, Android hides the browser address bar completely, rendering the game as a full-screen native Android app.

---

## 📋 Prerequisites Checklist

| Item | Requirement | Status |
| :--- | :--- | :--- |
| **PWA Web App Manifest** | `public/manifest.json` | ✅ **Configured** |
| **Service Worker** | `public/sw.js` (Offline caching) | ✅ **Configured & Registered** |
| **App Icon (512x512)** | `public/icons/icon-512.png` | ✅ **Generated & Placed** |
| **Feature Graphic (1024x500)**| `public/icons/feature-graphic.jpg` | ✅ **Generated & Placed** |
| **Asset Links Endpoint** | `/.well-known/assetlinks.json` | ✅ **Implemented** |
| **TWA Manifest Config** | `twa-manifest.json` | ✅ **Generated** |
| **Google Play Developer Account** | $25 one-time fee to Google | ⏳ You register once on [Google Play Console](https://play.google.com/console/signup) |
| **Live HTTPS Server** | Host Node.js/WebSocket backend | ⏳ Free deploy to Render / Railway / Fly.io |

---

## 🚀 Step 1: Deploying Your Backend to Live HTTPS

Google Play requires that your game runs over a secure **HTTPS** URL (with WebSockets supported via **WSS**).

### Recommended Free / Low-Cost Hosts:
1. **Render.com** (Recommended):
   - Create a free account at [render.com](https://render.com).
   - Click **New** -> **Web Service** -> Connect your GitHub repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Render automatically provides a free custom SSL domain: `https://cartagena-escape-diaries.onrender.com`.
2. **Railway.app**:
   - One-click GitHub deploy, handles WebSockets natively with automatic HTTPS.

---

## 📦 Step 2: Generating the Android App Bundle (`.aab`)

You have two methods to generate your production `.aab` file:

### Method A: PWABuilder (Fastest, No Android Studio Required)
1. Go to [PWABuilder.com](https://www.pwabuilder.com/).
2. Enter your live HTTPS game URL (e.g., `https://your-game.onrender.com`).
3. Click **Start**. PWABuilder will analyze your PWA (manifest, service worker, icons will show 100% score).
4. Click **Package for Stores** -> Select **Android**.
5. Configure package settings:
   - **Package ID**: `com.cartagena.escapediaries`
   - **App Name**: `Cartagena: Escape Diaries`
   - **Display Mode**: `Fullscreen` or `Standalone`
   - **Orientation**: `Landscape`
   - **Signing Key**: Select *Create new keystore* (save the password and `.keystore` file safely!).
6. Click **Generate** to download your signed `.aab` file!

### Method B: Google Bubblewrap CLI (Automated Terminal Build)
If you have Java JDK 17+ and Android SDK command-line tools installed:
```powershell
# Install Google's official Bubblewrap CLI
npm install -g @bubblewrap/cli

# Initialize build from twa-manifest.json
bubblewrap init --manifest="https://your-domain.com/manifest.json"

# Build production Android App Bundle
bubblewrap build
```
This generates `app-release-bundle.aab`.

---

## 🔐 Step 3: Verifying Digital Asset Links (No Browser URL Bar)

To ensure the game opens in pure full-screen without the Chrome top bar:
1. In your Google Play Console, go to **Release** > **Setup** > **App Signing**.
2. Copy the **SHA-256 certificate fingerprint** provided by Google.
3. Open `public/.well-known/assetlinks.json` and replace the placeholder:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.cartagena.escapediaries",
      "sha256_cert_fingerprints": [
        "PASTE_YOUR_GOOGLE_PLAY_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```
4. Push this change to your live web server. Android will verify it automatically on launch!

---

## 🎨 Step 4: Google Play Store Listing Preparation

The required graphic assets have already been generated and saved:

1. **App Icon**: `public/icons/icon-512.png` (512 x 512, 32-bit PNG, up to 1024KB).
2. **Feature Graphic**: `public/icons/feature-graphic.jpg` (1024 x 500, JPG or 24-bit PNG).
3. **Gameplay Screenshots**:
   - Take 2 to 8 landscape screenshots on your phone or browser (F12 device mode 1920x1080 or phone landscape).
   - Screenshots should highlight: Board View with pirate tokens, Pass & Play turn prompt, Hand cards, and Crew locator.
4. **App Details**:
   - **Title**: `Cartagena: Escape Diaries`
   - **Short description**: `Escape the Cartagena fortress in this thrilling pirate strategy board game!`
   - **Full description**:
     ```text
     Cartagena: Escape Diaries is a digital adaptation of the classic pirate tunnel escape board game.

     Lead your crew of 6 brave pirates through the winding fortress tunnel to the getaway boat. 
     Play symbol cards to leap forward to the next matching treasure space, or retreat backward to crowded spaces to draw fresh cards!

     FEATURES:
     ⚔️ Smart Bots: Choose your challenge level with Easy, Medium, or Hard AI captains.
     📱 Pass & Play: Play on a single device with 2 to 5 friends with private turn handoffs.
     🌐 Live Online Multiplayer: Create private rooms and invite friends via link or code.
     📜 Strategic Depth: Perfect balance of card management, blocking, and timing.
     🎨 Rich Pirate Aesthetics: Handcrafted maps, atmospheric sound effects, and smooth gameplay.
     ```

---

## ⚖️ Step 5: Content Rating & Privacy Policy

1. **Privacy Policy**:
   - Google requires a public URL for your privacy policy.
   - Since Cartagena: Escape Diaries only uses room codes and player names without tracking personal identifiable information, a simple static privacy policy hosted at `https://your-domain.com/privacy.html` satisfies all Play Store requirements.
2. **Content Rating**:
   - In Google Play Console, take the IARC Content Rating questionnaire.
   - Select Category: **Game** -> **Strategy / Board Game**.
   - Questions regarding violence, alcohol, etc.: Select **No** (the pirate theme is family-friendly cartoon/tactical).
   - You will receive an **Everyone (PEGI 3 / ESRB E)** rating.

---

## 🚢 Step 6: Rollout & Launch Tracks

1. **Internal Testing**:
   - Upload your `.aab` file to **Testing** > **Internal testing**.
   - Add your own email and install via the test link immediately.
2. **Closed Testing**:
   - For new personal Google Play accounts created after Nov 2023, Google requires a 14-day closed test with 20 opt-in testers.
   - Share your test link with friends or community members.
3. **Production Release**:
   - Promote to **Production** and submit for review. Google typically reviews new games within 24 to 72 hours.
