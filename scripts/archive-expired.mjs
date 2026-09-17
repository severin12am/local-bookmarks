import Database from "better-sqlite3";

const db = new Database("data/bookmarks.db");

// Confirmed expired time-limited offers (not evergreen / not news)
const EXPIRED_IDS = [
  261, // Solana hackathon — submissions closed May 11
  295, // Mitte promo code HANASUPPORT26
  395, // Lovable SheBuilds credits expire fast
  566, // Dedalus free until Jan 12
  518, // ChatGPT apps ~90 day window
  821, // Nano Banana hackathon Sep 2025
  819, // Freepik nano banana discount promo
  831, // Nano Banana hackathon
  988, // xAI Live Search free limited time
];

const now = new Date().toISOString();

let expired = db
  .prepare(`SELECT id FROM collections WHERE name = ?`)
  .get("Expired");

if (!expired) {
  const info = db
    .prepare(
      `INSERT INTO collections (name, parent_id, sort_order, created_at) VALUES (?, NULL, 999, ?)`
    )
    .run("Expired", now);
  expired = { id: Number(info.lastInsertRowid) };
  console.log("Created Expired collection", expired.id);
} else {
  console.log("Using Expired collection", expired.id);
}

const update = db.prepare(
  `UPDATE bookmarks SET collection_id = ?, updated_at = ? WHERE id = ?`
);

let moved = 0;
for (const id of EXPIRED_IDS) {
  const row = db
    .prepare(`SELECT id, author_username, substr(text,1,60) as t FROM bookmarks WHERE id = ?`)
    .get(id);
  if (!row) {
    console.log("missing", id);
    continue;
  }
  update.run(expired.id, now, id);
  moved += 1;
  console.log("archived", id, row.author_username, row.t);
}

console.log("MOVED", moved);
console.log(
  "Expired count",
  db.prepare(`SELECT count(*) as c FROM bookmarks WHERE collection_id = ?`).get(expired.id).c
);
