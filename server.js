require("dotenv").config();
const express = require("express");
const cheerio = require("cheerio");
const dns = require("dns").promises;
const net = require("net");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MAX_CHARS = 12000; // keep the prompt small for the free tier

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- helpers ----------

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Block localhost / private network addresses so the server can't be
// tricked into fetching internal resources.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function validateUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("That doesn't look like a valid URL. Include https:// at the start.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UserError("Only http and https links are supported.");
  }
  try {
    const { address } = await dns.lookup(url.hostname);
    if (isPrivateIp(address)) throw new UserError("That address isn't allowed.");
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError("Couldn't find that website. Check the URL and try again.");
  }
  return url;
}

async function scrape(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SummarizerBot/1.0)" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
  } catch {
    throw new UserError("The page took too long to respond or couldn't be reached.", 502);
  }

  if (!res.ok) throw new UserError(`The site returned an error (${res.status}).`, 502);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new UserError("That link isn't a web page (HTML).");

  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || url.hostname;

  $("script, style, noscript, svg, iframe, form, nav, footer, header, aside").remove();

  // Prefer the main article area, fall back to the whole body.
  let root = $("article").first();
  if (!root.length) root = $("main").first();
  if (!root.length) root = $("body");

  const parts = [];
  root.find("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 25) parts.push(t);
  });

  let text = parts.join("\n");
  if (text.length < 200) text = root.text().replace(/\s+/g, " ").trim();
  if (text.length < 200) {
    throw new UserError("Not enough readable text found. The page may need JavaScript to load.");
  }

  return { title, text: text.slice(0, MAX_CHARS) };
}

async function summarize(title, text) {
  if (!GROQ_API_KEY) throw new UserError("Server is missing GROQ_API_KEY. See the README.", 500);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 450,
      messages: [
        {
          role: "system",
          content:
            "You summarize web pages. Write a short summary of 3-4 sentences, then a blank line, " +
            "then 3 key points, each on its own line starting with '- '. Use plain text only. " +
            "Use only information from the page.",
        },
        { role: "user", content: `Page title: ${title}\n\nPage text:\n${text}` },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 429) throw new UserError("The free AI limit was reached. Wait a minute and retry.", 429);
  if (!res.ok) throw new UserError("The AI service returned an error. Try again.", 502);

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ---------- API ----------

app.post("/api/summarize", async (req, res) => {
  try {
    const url = await validateUrl(String(req.body?.url || "").trim());
    const { title, text } = await scrape(url);
    const summary = await summarize(title, text);
    if (!summary) throw new UserError("The AI returned an empty summary. Try again.", 502);
    res.json({ title, url: url.href, summary });
  } catch (err) {
    const status = err.status || 500;
    if (!(err instanceof UserError)) console.error(err);
    res.status(status).json({ error: err instanceof UserError ? err.message : "Something went wrong." });
  }
});

app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
