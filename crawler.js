import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const FEEDS = [
  {
    name: "Snyk Blog",
    url: "https://snyk.io/blog/feed/",
    keywords: [
      "supply chain",
      "malicious",
      "malware",
      "backdoor",
      "compromised",
      "typosquatting",
      "npm",
      "pypi",
    ],
  },
];

const OUTPUT_DIR = join(import.meta.dirname, "logs");
const HOURS = 48;

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
        || block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    items.push({
      title: get("title"),
      link: get("link"),
      pubDate: get("pubDate"),
      description: get("description").replace(/<[^>]+>/g, "").slice(0, 300),
    });
  }
  return items;
}

function isRecent(pubDate, hours) {
  const published = new Date(pubDate);
  if (isNaN(published.getTime())) return false;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return published.getTime() > cutoff;
}

function isSecurityRelevant(item, keywords) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "vuln-check/0.2.0" },
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  return items
    .filter((item) => isRecent(item.pubDate, HOURS))
    .filter((item) => isSecurityRelevant(item, feed.keywords));
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10);
  const results = { date: timestamp, sources: [], articles: [] };

  for (const feed of FEEDS) {
    try {
      const articles = await fetchFeed(feed);
      results.sources.push({ name: feed.name, status: "ok", count: articles.length });
      results.articles.push(...articles.map((a) => ({ ...a, source: feed.name })));
    } catch (err) {
      results.sources.push({ name: feed.name, status: "error", message: err.message });
    }
  }

  const outPath = join(OUTPUT_DIR, `feed-${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(JSON.stringify(results, null, 2));
}

main();
