import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const db = new Database("data/bookmarks.db");

const rows = db
  .prepare(
    `
  SELECT b.id, b.tweet_id, b.author_username, b.author_name, b.tweet_created_at,
         b.url, b.text, b.media_json, b.notes, c.name as collection
  FROM bookmarks b
  LEFT JOIN collections c ON c.id = b.collection_id
  WHERE c.name IS NULL OR c.name != 'Expired'
  ORDER BY b.tweet_created_at DESC
`
  )
  .all();

/** Strong clipping / short-form production signals */
const CLIP =
  /\b((?:auto[- ]?)?clip(?:ping|s|ped)?|opus\s*clip|opusclip|klap|munch|vizard|vidyo\.?ai|capcut|faceless(?:\s+youtube|\s+channel)?|youtube\s+shorts|short[- ]form\s+(?:video|content)|reframe|vertical\s+(?:cut|edit|video)|highlight\s+reel|clip\s+(?:his|her|their|a|the|your|long)\s+(?:channel|podcast|stream|video|vod)|vod\s+to\s+short|longform\s+to\s+short|podcast\s+clip|stream\s+clip|editing\s+software|premiere\s+pro|davinci|descript|subtitle\s+shorts?)\b/i;

const LOCAL =
  /\b(local|offline|on[- ]?device|desktop\s+app|self[- ]?host|runs?\s+on\s+(?:your|my)\s+(?:pc|mac|machine|computer|gpu)|ffmpeg|whisper|obs\b|premiere|davinci|final\s+cut|open[- ]?sourc(?:e|ed)|no\s+cloud)\b/i;

const NOISE =
  /\b(clipboard|paperclip|this clip a million|get the f\*cking money|zip your entire app|app store|palestinian|israel|occupied land)\b/i;

const hits = [];
for (const row of rows) {
  const text = row.text || "";
  if (!CLIP.test(text)) continue;
  if (NOISE.test(text)) continue;

  hits.push({
    ...row,
    localScore: LOCAL.test(text) ? 1 : 0,
    snippet: text.replace(/\s+/g, " ").trim(),
  });
}

hits.sort((a, b) => {
  if (b.localScore !== a.localScore) return b.localScore - a.localScore;
  return String(b.tweet_created_at || "").localeCompare(String(a.tweet_created_at || ""));
});

const local = hits.filter((h) => h.localScore);
const other = hits.filter((h) => !h.localScore);

function section(title, list) {
  const lines = [`## ${title} (${list.length})`, ""];
  list.forEach((b, i) => {
    lines.push(`### ${i + 1}. @${b.author_username || "unknown"} — ${b.author_name || ""}`);
    lines.push("");
    if (b.url) lines.push(`- URL: ${b.url}`);
    if (b.tweet_created_at) lines.push(`- Date: ${b.tweet_created_at}`);
    if (b.collection) lines.push(`- Collection: ${b.collection}`);
    lines.push("");
    lines.push(b.snippet || "(no text)");
    lines.push("");
    try {
      const media = JSON.parse(b.media_json || "[]");
      if (media.length) {
        lines.push("Media:");
        for (const m of media) lines.push(`- ${m.type || "media"}: ${m.url}`);
        lines.push("");
      }
    } catch {
      // ignore
    }
    lines.push("---");
    lines.push("");
  });
  return lines.join("\n");
}

const exportedAt = new Date().toISOString();
const md = [
  "# Clipping bookmarks (local-first)",
  "",
  `Exported: ${exportedAt}`,
  `Total: ${hits.length} · Local-leaning: ${local.length} · Cloud/other: ${other.length}`,
  "",
  "Includes clipping, shorts, faceless/YouTube clip workflows, CapCut/Premiere/etc.",
  "Local-leaning listed first when the post mentions desktop/local/offline/open-source tools.",
  "",
  "---",
  "",
  section("Local / on-device leaning", local),
  section("Other clipping / shorts / faceless", other),
].join("\n");

const json = {
  exportedAt,
  topic: "clipping",
  preference: "local mostly",
  counts: { total: hits.length, local: local.length, other: other.length },
  bookmarks: hits.map((b) => ({
    id: b.tweet_id,
    local: Boolean(b.localScore),
    text: b.text,
    author: { name: b.author_name, username: b.author_username },
    created_at: b.tweet_created_at,
    url: b.url,
    notes: b.notes,
    collection: b.collection,
    media: (() => {
      try {
        return JSON.parse(b.media_json || "[]");
      } catch {
        return [];
      }
    })(),
  })),
};

const outDir = path.join(process.cwd(), "exports");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "clipping-local-bookmarks.md"), md);
fs.writeFileSync(
  path.join(outDir, "clipping-local-bookmarks.json"),
  JSON.stringify(json, null, 2)
);

console.log(
  JSON.stringify(
    {
      files: [
        "d:\\bookmarks\\exports\\clipping-local-bookmarks.md",
        "d:\\bookmarks\\exports\\clipping-local-bookmarks.json",
      ],
      ...json.counts,
    },
    null,
    2
  )
);
for (const b of hits) {
  console.log(
    `${b.localScore ? "LOCAL" : "other"} | @${b.author_username} | ${b.snippet.slice(0, 110)}`
  );
}
