<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10s4qsY-ZClHkQnu8U-0vehc7W_ymbs5M

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` in the project root and set `ANTHROPIC_API_KEY=your-key` (get a key from [Anthropic Console](https://console.anthropic.com/)). Restart the dev server after changing env.
3. Run the app:
   `npm run dev`

## Voting history from local PDFs

To populate the **Voting History** tab from Board of Trustees meeting minutes in `documents/board_of_trustees_documents`:

1. Install Python deps (once): `pip install pypdf requests` (or `pip install -r py/requirements.txt`).
2. Ensure `ANTHROPIC_API_KEY` is set in `.env.local`.
3. Run the scanner (default: first 3 minute PDFs):  
   `npm run scan-votes` or `python py/scan_trustees_votes.py --limit 3`.  
   To process more: `python py/scan_trustees_votes.py --limit 10`.
4. Refresh the app; the Voting History tab will load `public/generated-votes.json` automatically.
