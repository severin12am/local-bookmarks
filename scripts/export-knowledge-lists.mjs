import Database from "better-sqlite3";
import fs from "fs";

const db = new Database("data/bookmarks.db");

const rows = db
  .prepare(
    `
  SELECT b.id, b.tweet_id, b.author_username, b.author_name, b.tweet_created_at,
         b.url, b.text, b.notes, c.name as collection
  FROM bookmarks b
  LEFT JOIN collections c ON c.id = b.collection_id
  WHERE c.name IS NULL OR c.name != 'Expired'
  ORDER BY b.tweet_created_at DESC
`
  )
  .all();

function t(r) {
  return `${r.text || ""} ${r.notes || ""}`.replace(/\s+/g, " ").trim();
}
function hay(r) {
  return t(r).toLowerCase();
}

const BLOCK_COL = new Set(["News & Politics", "Faith & Religion"]);
const BLOCK_RE =
  /\b(gaza|palestine|palestinian|israel|israeli|netanyahu|genocide|apartheid|hamas|idf|quran|allah|islam|muslim|trump|biden|election|9\/11)\b/i;

function clean(list) {
  return list.filter((r) => !BLOCK_COL.has(r.collection) && !BLOCK_RE.test(r.text || ""));
}

function hasAny(text, kws) {
  const h = text.toLowerCase();
  return kws.some((k) => h.includes(k));
}

function collect(kws, extraFilter) {
  return clean(rows).filter((r) => {
    const h = hay(r);
    if (!hasAny(h, kws)) return false;
    return extraFilter ? extraFilter(r, h) : true;
  });
}

const game = collect(
  [
    "three.js",
    "threejs",
    "webgpu",
    "webgl",
    "shader",
    "3d ",
    "3d game",
    "gamedev",
    "game ",
    "godot",
    "unity",
    "unreal",
    "phaser",
    "pixi",
    "r3f",
    "react-three",
    "blender",
    "low poly",
    "lowpoly",
    "voxel",
    "particle",
    "procedural",
    "isometric",
    "city builder",
    "tower defense",
    "asset",
    "mesh",
    "animation",
    "beautiful web",
    "ui/ux",
    "framer",
    "gsap",
    "canvas",
    "interactive 3d",
    "vibe coded",
    "vibecoding",
  ],
  (r, h) =>
    !h.includes("chatgpt app store") &&
    !h.includes("larp") &&
    !h.includes("vacation research")
);

const rn = collect(
  [
    "react native",
    "expo",
    "ios app",
    "app store",
    "xcode",
    "swiftui",
    "mobile app",
    "on-device",
    "habit",
    "goal",
    "gamif",
    "streak",
    "productivity",
    "task breakdown",
    "small task",
    "progress",
    "onboarding",
    "aso",
    "screenshot",
    "app store connect",
    "preflight",
    "rejection",
    "system prompt",
    "claude project",
    "agent",
    "local model",
    "whisper",
  ],
  (r, h) =>
    !h.includes("reddit") || h.includes("app")
);

const moneyCols = new Set([
  "Indie Hacking & Startups",
  "Marketing & Growth",
  "Business & Money",
  "Video & YouTube",
  "Coding & Dev Tools",
  "AI & LLMs",
  "Design & Creative",
]);

const moneyKw = [
  "saas",
  "arr",
  "mrr",
  "indie",
  "startup",
  "monetiz",
  "make money",
  "revenue",
  "pricing",
  "distribution",
  "growth",
  "marketing",
  "content",
  "youtube",
  "faceless",
  "agency",
  "consult",
  "freelance",
  "launch",
  "offer",
  "sales",
  "solopreneur",
  "side project",
  "build in public",
  "customers",
  "product hunt",
  "clipping",
  "automation",
  "agent",
  "vibe code",
  "ship",
  "distribution",
  "audience",
];

const money = clean(rows).filter((r) => {
  if (moneyCols.has(r.collection) && hasAny(hay(r), moneyKw)) return true;
  if (hasAny(hay(r), moneyKw) && !BLOCK_COL.has(r.collection)) return true;
  return false;
});

function dumpList(list, limit) {
  return list.slice(0, limit).map((r) => ({
    author: r.author_username,
    name: r.author_name,
    date: r.tweet_created_at,
    url: r.url,
    collection: r.collection,
    text: t(r),
  }));
}

function writeJson(name, list, limit) {
  const data = dumpList(list, limit);
  fs.writeFileSync(`exports/${name}.json`, JSON.stringify(data, null, 2));
  console.log(name, list.length, "exported", data.length);
  for (const x of data.slice(0, 12)) {
    console.log(" -", "@" + x.author, x.text.slice(0, 110));
  }
}

writeJson("_k-game", game, 50);
writeJson("_k-rn", rn, 50);
writeJson("_k-money", money, 180);
