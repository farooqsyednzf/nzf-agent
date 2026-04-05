# NZF Chat Agent — Test Page

Internal test deployment for the NZF chat agent. Built on Netlify + GitHub.

---

## Repo Structure

```
├── index.html                  ← NZF About test page with chat agent embedded
├── nzf-chat-widget.js          ← Chat widget (floating button, UI, conversation)
├── netlify/
│   └── functions/
│       └── chat.js             ← Serverless backend (Claude + Coda + Zoho Desk)
├── netlify.toml                ← Netlify build + function config
├── package.json                ← Dependencies (@anthropic-ai/sdk)
└── .env.example                ← Environment variable template
```

---

## Deploy Steps

### 1. Create GitHub repo

- Go to github.com → New repository
- Name it `nzf-chat-test` (or anything you like)
- Set to **Private**
- Don't initialise with README (you already have these files)

### 2. Push files to GitHub

Open Terminal (Mac) or PowerShell (Windows) and run:

```bash
git init
git add .
git commit -m "Initial NZF chat agent test deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nzf-chat-test.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.

### 3. Connect to Netlify

- Go to app.netlify.com → Add new site → Import an existing project
- Choose **GitHub** → authorise → select your `nzf-chat-test` repo
- Build settings will be auto-detected from `netlify.toml`
- Click **Deploy site**

### 4. Add environment variables

In Netlify: **Site configuration → Environment variables → Add variable**

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `CODA_API_KEY` | `001dc349-c1b7-460d-885f-488737fcefec` |
| `ZOHO_CLIENT_ID` | `1000.4P81GMOAZNJ0XFAJT8G7MSAZJS8I4Z` |
| `ZOHO_CLIENT_SECRET` | `66332dfde59d453882eedc9a6231b71ce74c3237f5` |
| `ZOHO_REFRESH_TOKEN` | `1000.8c737a61e362f4a3ad6df9f74d0923f9.c7e1418f5ece6f0dad40a48e101033e1` |

After adding all variables → **Trigger redeploy** (Deploys tab → Trigger deploy → Deploy site).

### 5. Test

Once deployed, visit your Netlify URL (e.g. `https://nzf-chat-test.netlify.app`).
The chat bubble should appear in the bottom-right corner.

---

## Making Changes

Any push to the `main` branch auto-deploys to Netlify.

```bash
# After editing any file:
git add .
git commit -m "Description of change"
git push
```

---

## Checking Logs

If the chat agent returns errors:
- Netlify dashboard → **Functions** tab → click **chat** → view real-time logs

---

## Environment Variable Reference

| Variable | What it's for |
|----------|--------------|
| `ANTHROPIC_API_KEY` | Claude API — powers the chat agent |
| `CODA_API_KEY` | Reads the NZF Zakat Q&A knowledge base |
| `ZOHO_CLIENT_ID` | Zoho OAuth — for creating Desk tickets |
| `ZOHO_CLIENT_SECRET` | Zoho OAuth — for creating Desk tickets |
| `ZOHO_REFRESH_TOKEN` | Zoho OAuth — long-lived token, doesn't expire |
