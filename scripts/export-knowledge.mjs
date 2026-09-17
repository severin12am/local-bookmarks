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

console.log("total", rows.length);
const byCol = {};
for (const r of rows) {
  const k = r.collection || "(none)";
  byCol[k] = (byCol[k] || 0) + 1;
}
console.log(byCol);

function hay(r) {
  return `${r.text || ""} ${r.author_username || ""} ${r.notes || ""} ${r.collection || ""}`.toLowerCase();
}

function matchAny(text, pats) {
  return pats.some((p) => (typeof p === "string" ? text.includes(p) : p.test(text)));
}

const GAME = [
  "game",
  "gamedev",
  "unity",
  "unreal",
  "godot",
  "three.js",
  "threejs",
  "webgl",
  "canvas",
  "pixi",
  "phaser",
  "shader",
  "3d",
  "city",
  "tower",
  "defend",
  "defense",
  "defence",
  "rts",
  "simulation",
  "blender",
  "asset",
  "procedural",
  "animation",
  "vfx",
  "particle",
  "map",
  "isometric",
  "voxel",
  "low poly",
  "lowpoly",
  "terrain",
  "building",
  "architecture",
];

const WEB = [
  "next.js",
  "nextjs",
  "react",
  "typescript",
  "tailwind",
  "web app",
  "frontend",
  "ui/ux",
  "figma",
  "framer",
  "css",
  "design system",
  "animation",
  "gsap",
  "r3f",
  "react-three",
  "webgpu",
  "performance",
  "vite",
  "supabase",
  "sqlite",
];

const RN = [
  "react native",
  "expo",
  "ios",
  "swift",
  "mobile app",
  "app store",
  "rn ",
  "react-native",
];

const GOALS = [
  "habit",
  "goal",
  "productivity",
  "task",
  "todo",
  "streak",
  "gamif",
  "progress",
  "castle",
  "puzzle",
  "visualiz",
  "accountability",
  "routine",
  "focus",
  "adhd",
  "split",
  "break down",
  "small task",
  "okr",
];

const AI_APP = [
  "llm",
  "gpt",
  "claude",
  "agent",
  "prompt",
  "openai",
  "on-device",
  "local model",
  "whisper",
  "ai app",
];

const MONEY = [
  "saas",
  "indie",
  "startup",
  "arr",
  "mrr",
  "monetiz",
  "make money",
  "revenue",
  "pricing",
  "distribution",
  "marketing",
  "growth",
  "content",
  "youtube",
  "faceless",
  "agency",
  "consult",
  "freelance",
  "product hunt",
  "launch",
  "founder",
  "customer",
  "offer",
  "sales",
  "solopreneur",
  "side project",
  "build in public",
];

function score(r, groups) {
  const t = hay(r);
  let s = 0;
  const hits = [];
  for (const [name, pats] of Object.entries(groups)) {
    let n = 0;
    for (const p of pats) {
      if (t.includes(p)) n++;
    }
    if (n) {
      s += n;
      hits.push(`${name}:${n}`);
    }
  }
  return { s, hits };
}

function pick(groups, min = 1, limit = 80) {
  return rows
    .map((r) => ({ r, ...score(r, groups) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
}

const gameHits = pick({ game: GAME, web: WEB, design: ["design", "beautiful", "aesthetic", "ui"] }, 1, 60);
const rnHits = pick({ rn: RN, goals: GOALS, ai: AI_APP, mobile: ["app store", "mobile", "onboarding"] }, 1, 60);
const moneyHits = pick(
  {
    money: MONEY,
    ai: ["ai", "llm", "agent", "automation"],
    content: ["youtube", "tiktok", "clip", "content"],
    coding: ["cursor", "vibe coding", "ship"],
  },
  1,
  200
);

console.log("\n=== GAME TOP ===");
for (const x of gameHits.slice(0, 25)) {
  console.log(x.s, x.hits.join(","), "@" + x.r.author_username, (x.r.text || "").replace(/\s+/g, " ").slice(0, 140));
}
console.log("\n=== RN TOP ===");
for (const x of rnHits.slice(0, 25)) {
  console.log(x.s, x.hits.join(","), "@" + x.r.author_username, (x.r.text || "").replace(/\s+/g, " ").slice(0, 140));
}
console.log("\n=== MONEY sample authors ===");
const authors = {};
for (const x of moneyHits) authors[x.r.author_username] = (authors[x.r.author_username] || 0) + 1;
console.log(
  Object.entries(authors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
);

fs.mkdirSync("exports", { recursive: true });
fs.writeFileSync(
  "exports/_knowledge-raw.json",
  JSON.stringify(
    {
      game: gameHits.map((x) => ({ score: x.s, hits: x.hits, ...x.r })),
      rn: rnHits.map((x) => ({ score: x.s, hits: x.hits, ...x.r })),
      money: moneyHits.map((x) => ({ score: x.s, hits: x.hits, ...x.r })),
    },
    null,
    2
  )
);
console.log("wrote exports/_knowledge-raw.json", {
  game: gameHits.length,
  rn: rnHits.length,
  money: moneyHits.length,
});
