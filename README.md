<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally or from anywhere with your own API key.

View your app in AI Studio: https://ai.studio/apps/drive/10s4qsY-ZClHkQnu8U-0vehc7W_ymbs5M

## Use your key from anywhere

You can run this app in the cloud or on any machine and have it use **your** Anthropic key without putting the key in the repo.

### Option 1: GitHub Codespaces (browser — any device)

1. **Store your key as a secret:** GitHub → your profile **Settings** → **Codespaces** → **Codespaces secrets** → **New secret**. Name: `ANTHROPIC_API_KEY`, Value: your key. It will be available in every Codespace you open for repos you allow.
2. Open this repo on GitHub → green **Code** → **Codespaces** → **Create codespace on main**.
3. In the codespace terminal, run: `npm run dev`. When the server starts, open the **Ports** tab and click the link for port 5173 (or the “Open in Browser” icon).

Your key is injected by GitHub; it never lives in the repo or in the codespace disk in plain text for others to see.

### Option 2: Deploy on Vercel (one URL you can use anywhere)

The app includes a Vercel serverless function that proxies chat requests to Anthropic using your key, so the key never appears in the browser.

1. **Push this repo to GitHub** (if it isn’t already).
2. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
3. **Add New Project** → **Import** your `database-document-scanner` repo. Use the default settings (Vercel will use the repo’s `vercel.json`).
4. **Before deploying**, open **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`  
   - **Value:** your Anthropic API key ([create one](https://console.anthropic.com/))  
   - **Environment:** leave all checked (Production, Preview, Development) so the key works for every deployment.
5. Click **Deploy**. When the build finishes, Vercel gives you a URL (e.g. `https://database-document-scanner-xxx.vercel.app`).
6. Open that URL in any browser. The chat uses your key on the server; only people with the link can use this instance.

**Later:** To change the key or update the app, edit the repo and push; Vercel will redeploy. To change the key only, use the project’s **Settings** → **Environment Variables** in Vercel.

### Option 3: Run locally (any computer you use)

1. Clone the repo and run the app on that machine (see **Run locally** below).
2. Create `.env.local` with `ANTHROPIC_API_KEY=your-key` on that machine. Use a password manager or secure note to copy the key when setting up—don’t commit `.env.local`.

---

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Create `.env.local` in the project root and set `ANTHROPIC_API_KEY=your-key` ([Anthropic Console](https://console.anthropic.com/)). Restart the dev server after changing env.
3. Run the app: `npm run dev`

## Voting history from local PDFs

To populate the **Voting History** tab from Board of Trustees meeting minutes in `documents/board_of_trustees_documents`:

1. Install Python deps (once): `pip install pypdf requests` (or `pip install -r py/requirements.txt`).
2. Ensure `ANTHROPIC_API_KEY` is set in `.env.local`.
3. Run the scanner (default: first 3 minute PDFs):  
   `npm run scan-votes` or `python py/scan_trustees_votes.py --limit 3`.  
   To process more: `python py/scan_trustees_votes.py --limit 10`.
4. Refresh the app; the Voting History tab will load `public/generated-votes.json` automatically.
