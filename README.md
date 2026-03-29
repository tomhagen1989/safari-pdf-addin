# PDF Saver — Safari Extension for iPhone

A reliable alternative to Safari's built-in Reader Mode for saving articles as PDF.
Strips ads, navigation and sidebars, then opens a clean print view.
On iOS: **Share → Print → pinch preview → Save to Files = PDF.**

---

## What's in this repo

```
safari-pdf-addin/
├── extension/          Safari Web Extension source (HTML/JS/CSS + manifest)
├── bookmarklet/        Zero-install fallback — works immediately in Safari
├── scripts/            Build helpers (icon generation, bookmarklet minifier)
├── ExportOptions.plist Xcode IPA export config (used by CI)
├── package.json
└── .github/workflows/
    └── build.yml       macOS CI: converts extension → Xcode project → IPA
```

---

## Quick start — Bookmarklet (no Xcode needed)

The bookmarklet is the fastest way to test on your iPhone **right now**, with no
developer account and no Xcode.

### Install

1. Open `bookmarklet/index.html` in Safari on your iPhone
   *(either from a local server, or push to GitHub Pages)*
2. Tap-and-hold the **Save as PDF** button → **Add to Bookmarks**
3. Name it **Save as PDF** and save it anywhere

### Use

1. Open any article in Safari
2. Tap the address bar → Bookmarks → **Save as PDF**
3. A clean article page opens in a new tab
4. Tap **Share → Print**
5. **Pinch outward** on the page thumbnail — this converts it to a PDF
6. Tap **Share → Save to Files → Save**

> **Pop-up blocked?** Safari may block the new tab on first use.
> Tap the "Pop-up Blocked" notice in the address bar and choose **Allow**.

---

## Full Safari Extension (proper toolbar button)

The extension adds a button to the Safari toolbar so you don't need to open
Bookmarks. Building it requires Xcode (Mac-only), but since you're on Windows
the **GitHub Actions CI pipeline does the build for you**.

### How the pipeline works

```
push to GitHub
      │
      ▼
ubuntu runner
  npm run generate-icons   → extension/icons/icon-{16,32,48,128}.png
  npm run build-bookmarklet → bookmarklet/index.html (bookmarklet injected)
      │
      ▼
macos runner
  xcrun safari-web-extension-converter extension/ → Xcode project
  xcodebuild (unsigned)   → validates code compiles ✓
  xcodebuild archive      → .xcarchive  (only if signing secrets set)
  xcodebuild -exportArchive → PDFSaver.ipa  (downloaded from CI artifacts)
```

### Step 1 — Push your code

```bash
git add .
git commit -m "Initial extension"
git push origin main
```

Go to **GitHub → Actions** and watch the workflow run.
The unsigned simulator build will succeed immediately (no secrets needed).

### Step 2 — Set up code signing

You need a **free Apple ID** for personal device installs (no $99/yr fee).
The paid Developer Program is only required for App Store / TestFlight distribution.

#### One-time setup (requires any Mac — a friend's Mac for 5 minutes is fine)

1. Open **Xcode → Settings → Accounts**, sign in with your Apple ID.
2. Click **Manage Certificates** → **+** → **Apple Development**.
   Xcode creates a certificate automatically.
3. Open **Keychain Access** (search in Spotlight).
4. Find **"Apple Development: your@email.com"** in **My Certificates**.
5. Right-click → **Export** → save as `cert.p12`, set a password.
6. Base64-encode the file and copy it:
   ```bash
   base64 -i cert.p12 | pbcopy
   ```
7. Go to **developer.apple.com → Certificates, Identifiers & Profiles**.
8. Register your iPhone's UDID under **Devices**.
9. Create an **App ID** with bundle identifier `com.example.pdfsaver`
   *(or your own bundle ID — update `BUNDLE_ID` in `build.yml` to match)*.
10. Create a **Development provisioning profile** for that App ID.
    Download it and base64-encode it:
    ```bash
    base64 -i profile.mobileprovision | pbcopy
    ```

#### Add secrets to GitHub

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SIGNING_CERTIFICATE_P12_BASE64` | base64 output from step 6 |
| `SIGNING_CERTIFICATE_PASSWORD` | the password you chose in step 5 |
| `KEYCHAIN_PASSWORD` | any strong random string (used only in CI) |
| `PROVISIONING_PROFILE_BASE64` | base64 output from step 10 |
| `APPLE_TEAM_ID` | your 10-char Team ID from developer.apple.com |

Push any commit to trigger a new build. The **PDFSaver-ipa** artifact will appear
in the workflow run once signing succeeds.

### Step 3 — Install on iPhone

**Option A — via Xcode (easiest)**

1. Download the `xcode-project` artifact from the CI run.
2. Open the `.xcodeproj` on any Mac.
3. Connect your iPhone via USB.
4. Select your device in the scheme picker and press **Run (▶)**.

**Option B — via AltStore (no Mac needed after initial setup)**

1. Install [AltStore](https://altstore.io) on your iPhone.
2. Download the `PDFSaver-ipa` artifact from the CI run.
3. Open AltStore → **My Apps → +** → select the `.ipa` file.

**Option C — via `ios-deploy` (Windows + WSL)**

```bash
npm install -g ios-deploy
ios-deploy --bundle PDFSaver.ipa
```

### Step 4 — Enable the extension

1. **Settings → Safari → Extensions → PDF Saver → On**
2. Set permissions to **All Websites** for a seamless experience
3. The PDF icon appears in the Safari toolbar

---

## How the extension works

```
User taps PDF Saver toolbar button
          │
          ▼
    popup.html opens (bottom sheet on iOS)
          │
          │  browser.tabs.sendMessage({ action: 'extract' })
          ▼
    content.js (runs in the page)
      • Tries semantic selectors: article, main, [role="main"] …
      • Falls back to scoring algorithm (text density, link density,
        class-name heuristics) to find the article element
      • Strips scripts, nav, ads, sidebars, social widgets
      • Resolves relative image/link URLs to absolute
      • Returns { title, byline, siteName, content, sourceUrl }
          │
          ▼
    popup.js stores data in browser.storage.local
    popup.js opens extension's print.html in a new tab
          │
          ▼
    print.html / print.js
      • Reads article from storage
      • Populates DOM with title, meta, cleaned body HTML
      • Calls window.print() after 900 ms
          │
          ▼
    iOS system Print sheet appears
    User: pinch outward on thumbnail → Share → Save to Files
          │
          ▼
    PDF saved  ✓
```

---

## Local development

You can test the extension in **Chrome or Edge** on Windows before touching iOS —
the extension code is standard Web Extension API.

```bash
# Clone and install
git clone https://github.com/tomhagen1989/safari-pdf-addin
cd safari-pdf-addin
npm install
npm run build          # generates icons + bookmarklet
```

### Load as unpacked extension in Chrome/Edge

1. Navigate to `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder
4. Open any article and click the extension icon

This gives you Chrome DevTools for debugging `content.js` and `popup.js`
before going to iOS.

### Bookmarklet development

Open `bookmarklet/index.html` directly in a browser.
The page self-loads `bookmarklet.js` via `fetch` for local development,
so you can iterate on the extraction algorithm without any build step.

---

## Code signing — FAQ

**Do I need the $99 Apple Developer Program?**
No. A free Apple ID lets you install on your own device via Xcode or AltStore.
The paid program is only needed for App Store submission or TestFlight distribution.

**The CI build fails at the archive step**
The unsigned simulator build should still pass. Check that all five secrets are
set correctly. Common issues:
- The `.p12` password has special characters — make sure it's set exactly.
- The provisioning profile doesn't include your device's UDID.
- The bundle ID in `build.yml` (`BUNDLE_ID`) doesn't match the App ID you
  registered on developer.apple.com.

**Can I change the bundle identifier?**
Yes. Update `BUNDLE_ID` in `.github/workflows/build.yml` and `ExportOptions.plist`.
The bundle ID must match what you registered on developer.apple.com.

---

## Safari Web Extension gotchas

- **Content script permissions**: On iOS, Safari prompts
  *"Allow PDF Saver to read webpages?"* — choose **Always Allow**.
- **Page reload required**: If you install the extension while a tab is already
  open, reload the tab before using it (the content script wasn't injected yet).
- **Restricted pages**: The extension can't run on `about:`, `file:`, or Apple's
  own pages (`apple.com` etc.). A helpful error message is shown.
- **Pop-up blocking** (bookmarklet): Allow pop-ups for the site if Safari blocks
  the print window.

---

## Contributing

Pull requests welcome. Key files:

| File | Purpose |
|---|---|
| `extension/content.js` | Article extraction algorithm |
| `extension/print.css` | Print-page typography |
| `bookmarklet/bookmarklet.js` | Self-contained fallback |
| `.github/workflows/build.yml` | CI pipeline |
