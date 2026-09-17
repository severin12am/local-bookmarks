import Database from "better-sqlite3";
import fs from "fs";

const db = new Database("data/bookmarks.db");
const rows = db
  .prepare(
    `SELECT b.author_username, b.url, b.text, c.name as collection
     FROM bookmarks b LEFT JOIN collections c ON c.id = b.collection_id
     WHERE c.name IS NULL OR c.name != 'Expired'`
  )
  .all();

const kws = process.argv.slice(2);
const hits = rows.filter((r) => {
  const h = `${r.text} ${r.collection}`.toLowerCase();
  if (/\b(gaza|palestine|israel|netanyahu|quran|allah|trump)\b/i.test(h)) return false;
  return kws.every((k) => h.includes(k.toLowerCase()));
});
const anyHits = rows.filter((r) => {
  const h = `${r.text}`.toLowerCase();
  if (/\b(gaza|palestine|israel|netanyahu|quran|allah)\b/i.test(h)) return false;
  return kws.some((k) => h.includes(k.toLowerCase()));
});

console.log("ALL kws", hits.length, "ANY", anyHits.length);
for (const r of anyHits.slice(0, 25)) {
  console.log("@" + r.author_username, (r.collection || "-"), (r.text || "").replace(/\s+/g, " ").slice(0, 130));
  console.log(r.url);
}
