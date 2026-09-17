import fs from "fs";
import path from "path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function qidPath() {
  return path.join(process.cwd(), "data", "x-qids.json");
}

export function loadQids(): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(qidPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveQids(qids: Record<string, string>) {
  fs.mkdirSync(path.dirname(qidPath()), { recursive: true });
  fs.writeFileSync(qidPath(), JSON.stringify(qids, null, 2));
}

export function extractQueryIds(js: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const m of js.matchAll(/queryId\s*:\s*"([^"]+)"\s*,\s*operationName\s*:\s*"(\w+)"/g)) {
    if (m[1] && m[2]) out[m[2]] = m[1];
  }
  for (const m of js.matchAll(
    /operationName\s*:\s*"(\w+)"\s*,\s*queryId\s*:\s*"([^"]+)"/g
  )) {
    if (m[1] && m[2]) out[m[1]] = m[2];
  }
  for (const m of js.matchAll(
    /operationName:"(\w+)"(?:(?!operationName:)[\s\S]){0,240}?queryId:"([^"]+)"/g
  )) {
    if (m[1] && m[2] && !out[m[1]]) out[m[1]] = m[2];
  }
  // Quoted JSON-ish forms inside some chunks
  for (const m of js.matchAll(
    /"operationName"\s*:\s*"(\w+)"\s*,\s*"queryId"\s*:\s*"([^"]+)"/g
  )) {
    if (m[1] && m[2]) out[m[1]] = m[2];
  }
  for (const m of js.matchAll(
    /"queryId"\s*:\s*"([^"]+)"\s*,\s*"operationName"\s*:\s*"(\w+)"/g
  )) {
    if (m[1] && m[2]) out[m[2]] = m[1];
  }

  return out;
}

function bundleUrls(text: string): string[] {
  const urls = [
    ...text.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[\w./+-]+\.js/g),
  ].map((m) => m[0]);

  // Webpack chunk map entries: "api...Bookmarks...":"hash"
  for (const m of text.matchAll(
    /"(api[^"]*[Bb]ookmark[^"]*)"\s*:\s*"([a-f0-9]+)"/g
  )) {
    urls.push(
      `https://abs.twimg.com/responsive-web/client-web/${m[1]}.${m[2]}a.js`
    );
    urls.push(
      `https://abs.twimg.com/responsive-web/client-web/${m[1]}.${m[2]}.js`
    );
  }

  return [...new Set(urls)];
}

function prioritize(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const score = (u: string) => {
      let s = 0;
      if (/bookmark/i.test(u)) s += 100;
      if (/api\./i.test(u)) s += 20;
      if (/main\./i.test(u)) s += 10;
      return s;
    };
    return score(b) - score(a);
  });
}

async function fetchText(url: string, cookie?: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    };
    if (cookie) {
      headers.cookie = cookie;
      headers["x-twitter-active-user"] = "yes";
      headers["x-twitter-auth-type"] = "OAuth2Session";
    }
    const res = await fetch(url, {
      headers,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Discover current GraphQL query IDs from X web bundles. */
export async function refreshQueryIds(cookie?: string): Promise<{
  ok: boolean;
  qids: Record<string, string>;
  message: string;
}> {
  const seeds = ["https://x.com/", "https://x.com/i/bookmarks", "https://x.com/home"];
  const merged = { ...loadQids() };
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const seed of seeds) {
    const html = await fetchText(seed, cookie);
    if (!html) continue;
    Object.assign(merged, extractQueryIds(html));
    queue.push(...bundleUrls(html));
  }

  if (queue.length === 0) {
    return {
      ok: false,
      qids: merged,
      message: "Could not reach x.com to discover API endpoints",
    };
  }

  const MAX = 80;
  const ordered = prioritize(queue);

  while (ordered.length > 0 && seen.size < MAX) {
    const url = ordered.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);

    const js = await fetchText(url, cookie);
    if (!js) continue;

    Object.assign(merged, extractQueryIds(js));
    for (const next of prioritize(bundleUrls(js))) {
      if (!seen.has(next)) ordered.push(next);
    }
    if (merged.BookmarkSearchTimeline || merged.Bookmarks) break;
  }

  saveQids(merged);

  const listId = merged.BookmarkSearchTimeline || merged.Bookmarks;
  if (!listId) {
    return {
      ok: false,
      qids: merged,
      message:
        "Could not auto-detect Bookmarks API id. Open x.com/i/bookmarks with Network tab, click BookmarkSearchTimeline (or Bookmarks), and paste the query id from the URL.",
    };
  }

  return {
    ok: true,
    qids: merged,
    message: `Ready (list query: ${listId})`,
  };
}

export function resolveBookmarksQid(): string | null {
  const qids = loadQids();
  return (
    process.env.X_BOOKMARKS_QID ||
    qids.BookmarkSearchTimeline ||
    qids.Bookmarks ||
    null
  );
}

export function setBookmarksQid(qid: string) {
  const qids = loadQids();
  qids.Bookmarks = qid.trim();
  saveQids(qids);
}
