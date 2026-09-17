import fs from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractQueryIds(js) {
  const out = {};
  for (const m of js.matchAll(
    /queryId\s*:\s*"([^"]+)"\s*,\s*operationName\s*:\s*"(\w+)"/g
  )) {
    out[m[2]] = m[1];
  }
  for (const m of js.matchAll(
    /operationName\s*:\s*"(\w+)"\s*,\s*queryId\s*:\s*"([^"]+)"/g
  )) {
    out[m[1]] = m[2];
  }
  return out;
}

function bundleUrls(text) {
  const urls = [
    ...text.matchAll(
      /https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[\w./+-]+\.js/g
    ),
  ].map((m) => m[0]);

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

const creds = JSON.parse(fs.readFileSync("data/sync-temp.json", "utf8"));
const cookie = `auth_token=${creds.authToken}; ct0=${creds.ct0}`;

const html = await (
  await fetch("https://x.com/i/bookmarks", {
    headers: { cookie, "user-agent": UA },
  })
).text();

const seen = new Set();
const queue = bundleUrls(html);
const q = {};

console.log("seed", queue.length);

while (queue.length && seen.size < 150) {
  const u = queue.shift();
  if (seen.has(u)) continue;
  seen.add(u);
  try {
    const js = await (await fetch(u, { headers: { "user-agent": UA } })).text();
    Object.assign(q, extractQueryIds(js));
    if (js.includes('operationName:"Bookmarks"') || js.includes("Bookmarks")) {
      if (/operationName:"Bookmarks"/.test(js)) {
        console.log("FOUND Bookmarks op in", u);
      }
    }
    for (const next of bundleUrls(js)) {
      if (!seen.has(next)) {
        if (/bookmark/i.test(next)) queue.unshift(next);
        else queue.push(next);
      }
    }
  } catch {
    // ignore
  }
}

const bookOps = Object.keys(q)
  .filter((k) => /Book/i.test(k))
  .sort();
console.log("bookmark ops:", bookOps);
for (const k of bookOps) console.log(k, q[k]);
console.log("crawled", seen.size);
