# Page Summarizer

Paste a webpage URL and get a short AI summary. The backend scrapes the page text and sends it to Groq's free AI API.

**Live demo:** https://YOUR-APP.onrender.com
**Stack:** Node.js + Express (backend), Cheerio (scraping), Groq API (AI), plain HTML/CSS/JS (frontend)

## Project structure

```
ai-summarizer/
├── server.js          <- backend (API + serves the frontend)
├── public/
│   └── index.html     <- frontend (input, button, loading state, summary)
├── package.json
├── .env               <- YOU create this (API key goes here, never commit it)
└── .env.example       <- template for .env
```

The frontend and backend run together: the Express server serves `public/index.html` and also exposes the API at `POST /api/summarize`. There is no separate frontend server, so you only start one process.

## Run locally

### 1. Prerequisites
- Node.js 18 or newer (check with `node -v`)
- A free Groq API key from https://console.groq.com/keys

### 2. Install dependencies
```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
npm install
```

### 3. Add your API key (.env file)
Create a file named `.env` in the **project root**, in the same folder as `server.js` and `package.json`:

```
GROQ_API_KEY=your_groq_key_here
```

You can copy the template instead: `cp .env.example .env` (on Windows: `copy .env.example .env`), then paste your key.

### 4. Start the app (backend + frontend)
```bash
npm start
```

Open **http://localhost:3000** in your browser. Paste a URL and click **Summarize**.

## API

`POST /api/summarize`

Request body: `{ "url": "https://example.com/article" }`
Success response: `{ "title": "...", "url": "...", "summary": "..." }`
Error response: `{ "error": "readable message" }`

## How it works

1. The frontend sends the URL to `/api/summarize` and shows "Loading..." while it waits.
2. The backend checks the URL (http/https only, private and localhost addresses blocked).
3. It fetches the page and extracts headings, paragraphs and list items (preferring `<article>` or `<main>`), trimmed to about 12,000 characters.
4. It sends that text to Groq (`llama-3.3-70b-versatile`) and returns a 3-4 sentence summary plus 3 key points.

## Deploy (Render)

1. Push this repo to GitHub.
2. On https://render.com create a **New > Web Service** and connect the repo.
3. Settings: Runtime **Node**, Build Command `npm install`, Start Command `npm start`.
4. Under **Environment**, add `GROQ_API_KEY` with your key.
5. Deploy. Render sets the `PORT` automatically and the server already reads it.

On Render's free plan the app sleeps when idle, so the first load after a pause can take about a minute.

## Limitations

- Pages that need JavaScript to render their content can't be scraped (returns a clear error).
- Sites with bot protection may block the request.
- The free Groq tier has rate limits; the app shows a message if you hit one.
