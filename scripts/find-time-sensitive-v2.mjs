import Database from "better-sqlite3";

const db = new Database("data/bookmarks.db");
const now = new Date("2026-08-04T20:30:00.000Z");

const rows = db
  .prepare(
    `
  SELECT b.id, b.tweet_id, b.author_username, b.tweet_created_at, b.url, b.text,
         c.name as collection
  FROM bookmarks b
  LEFT JOIN collections c ON c.id = b.collection_id
`
  )
  .all();

function ageDays(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now - d) / 86400000;
}

/** True time-limited commercial / opportunity language (not news dates). */
const OFFER_RE =
  /\b(ends?(?:\s+(?:soon|tonight|today|tomorrow|this\s+week|sunday|monday|friday))?|ending\s+soon|expires?(?:\s+fast)?|deadline|limited[- ]time|last\s+day|last\s+chance|final\s+hours?|hours?\s+left|days?\s+left|only\s+\d+\s+(?:hours?|days?)|today\s+only|this\s+week\s+only|sale\s+ends|offer\s+ends|promo(?:\s+code|\s+ends)?|available\s+until|valid\s+until|apply\s+by|register\s+by|submissions?\s+close|closes?\s+(?:on|in|may|june|july|aug)|early\s+bird|presale|giveaway|for\s+the\s+next\s+\d+|next\s+24|next\s+48|%\s*off|discount|free\s+for\s+(?:the\s+)?(?:next\s+)?\d+|free\s+until|credits?\s+expire|hackathon|waitlist\s+closes?|use\s+code|coupon)\b/i;

const NOISE_RE =
  /\b(october\s*7|oct\.?\s*7|9\/11|september\s+11|new world order|gaza|palestine|netanyahu|idf|israel)\b/i;

const SHORT =
  /today only|tonight|ends tonight|hours? left|next 24|next 48|final hours?|ends today|last day|for the next \s*\d+\s*hours?|credits? expire fast|%\s*off right now|pay \$1|free until\s+\w+\s+\d+/i;

const WEEK =
  /this week only|ends this week|days? left|early bird|presale|deadline|apply by|register by|sale ends|offer ends|promo|limited time|last chance|giveaway|submissions?\s+close|hackathon|use code|discount|%\s*off|free for|coupon/i;

const hits = { expired: [], urgent: [], maybe: [] };

for (const row of rows) {
  const text = row.text || "";
  if (!OFFER_RE.test(text)) continue;
  if (NOISE_RE.test(text) && !/\$|%|discount|code|hackathon|credits?|presale|giveaway|sale/i.test(text)) {
    continue;
  }

  const age = ageDays(row.tweet_created_at);
  const item = {
    id: row.id,
    ageDays: age == null ? null : Math.round(age * 10) / 10,
    author: row.author_username,
    collection: row.collection,
    date: row.tweet_created_at?.slice(0, 10),
    url: row.url,
    text: text.replace(/\s+/g, " ").trim().slice(0, 240),
  };

  if (SHORT.test(text) && age != null && age > 3) {
    hits.expired.push({ ...item, why: "Hours/today-style offer, post is old" });
  } else if (WEEK.test(text) && age != null && age > 21) {
    hits.expired.push({ ...item, why: "Promo/limited offer language, 3+ weeks old" });
  } else if ((SHORT.test(text) || WEEK.test(text)) && age != null && age <= 7) {
    hits.urgent.push({ ...item, why: "Time-limited language + still recent" });
  } else if (WEEK.test(text) && age != null && age <= 21) {
    hits.urgent.push({ ...item, why: "Possibly still live (within ~3 weeks)" });
  } else if (OFFER_RE.test(text)) {
    hits.maybe.push({ ...item, why: "Offer-ish language; verify manually" });
  }
}

function dump(title, list) {
  console.log(`\n## ${title} (${list.length})\n`);
  for (const h of list.sort((a, b) => (a.ageDays ?? 0) - (b.ageDays ?? 0))) {
    console.log(`- **@${h.author}** · ${h.date} · ${h.ageDays}d ago · ${h.collection}`);
    console.log(`  ${h.why}`);
    console.log(`  ${h.text}`);
    console.log(`  ${h.url}`);
    console.log(`  db#${h.id}`);
    console.log("");
  }
}

dump("ACT FAST — check these soon", hits.urgent);
dump("LIKELY EXPIRED / no longer useful as offers", hits.expired);
dump("OFFER-RELATED — unclear, skim if curious", hits.maybe);
console.log(
  `TOTAL offers: urgent ${hits.urgent.length}, expired ${hits.expired.length}, unclear ${hits.maybe.length}`
);
