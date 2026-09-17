import Database from "better-sqlite3";

const db = new Database("data/bookmarks.db");
const now = new Date("2026-08-04T20:30:00.000Z"); // approx user "today"

const rows = db
  .prepare(
    `
  SELECT b.id, b.tweet_id, b.author_username, b.author_name, b.tweet_created_at, b.url, b.text,
         c.name as collection
  FROM bookmarks b
  LEFT JOIN collections c ON c.id = b.collection_id
  ORDER BY b.tweet_created_at DESC
`
  )
  .all();

const TIME_RE =
  /\b(ends?(?:\s+(?:soon|tonight|today|tomorrow|this\s+week|sunday|monday|friday|saturday))?|ending\s+soon|expires?|expir(?:e|ing|ed)|deadline|limited[- ]time|last\s+day|last\s+chance|final\s+hours?|hours?\s+left|days?\s+left|only\s+\d+\s+(?:hours?|days?)|today\s+only|this\s+week\s+only|sale\s+ends|offer\s+ends|promo\s+ends|available\s+until|valid\s+until|apply\s+by|register\s+by|rsvp|closes?\b|closing\b|early\s+bird|presale|giveaway|for\s+the\s+next\s+\d+|next\s+24|next\s+48|running\s+out|act\s+now|hurry|midnight|until\s+(?:sunday|monday|friday|saturday|tonight|tomorrow)|\d+%\s+off|discount|free\s+for\s+\d+|launch(?:ing)?\s+(?:today|tomorrow|this\s+week)|shipping\s+ends|drop\s+ends|waitlist)\b/i;

const DATE_RE =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i;

function ageDays(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function classify(row) {
  const text = row.text || "";
  const lower = text.toLowerCase();
  if (!TIME_RE.test(text) && !DATE_RE.test(text)) return null;

  const age = ageDays(row.tweet_created_at);
  const reasons = [];
  let bucket = "watch"; // expired | urgent | watch

  // Strong expired signals for old posts
  const shortWindow =
    /today only|tonight|ends tonight|hours? left|next 24|next 48|final hours?|ends today|last day|for the next \d+\s*hours?/i.test(
      text
    );
  const weekWindow =
    /this week only|ends this week|days? left|early bird|presale|deadline|apply by|register by|sale ends|offer ends|promo ends|limited time|last chance|giveaway|closes|closing/i.test(
      text
    );
  const hasExplicitDate = DATE_RE.test(text);

  if (shortWindow && age != null && age > 2) {
    bucket = "expired";
    reasons.push("short-lived offer language + post is older than 2 days");
  } else if (weekWindow && age != null && age > 14) {
    bucket = "expired";
    reasons.push("time-limited language + post is older than 2 weeks");
  } else if (shortWindow && age != null && age <= 2) {
    bucket = "urgent";
    reasons.push("hours/today language and still recent");
  } else if (weekWindow && age != null && age <= 7) {
    bucket = "urgent";
    reasons.push("deadline/limited-time language within last week");
  } else if (weekWindow && age != null && age <= 14) {
    bucket = "urgent";
    reasons.push("possibly still active (posted within 2 weeks)");
  } else if (hasExplicitDate && age != null && age > 30) {
    bucket = "expired";
    reasons.push("mentions a calendar date and post is over a month old");
  } else if (/giveaway|presale|early bird|discount|%\s*off|promo/i.test(text) && age != null && age > 21) {
    bucket = "expired";
    reasons.push("promo/giveaway language and likely stale");
  } else if (TIME_RE.test(text)) {
    bucket = "watch";
    reasons.push("time language present but unclear if still active");
  } else {
    return null;
  }

  // Soften: evergreen "until you" etc.
  if (
    /\buntil you\b|\buntil it\b|\bends when\b|\bnever ends\b|\bno deadline\b|\balways\b/i.test(
      text
    ) &&
    bucket === "expired"
  ) {
    return null;
  }

  return {
    bucket,
    reasons,
    ageDays: age == null ? null : Math.round(age * 10) / 10,
    id: row.id,
    author: row.author_username,
    collection: row.collection,
    date: row.tweet_created_at,
    url: row.url,
    text: text.replace(/\s+/g, " ").trim().slice(0, 280),
  };
}

const hits = [];
for (const row of rows) {
  const c = classify(row);
  if (c) hits.push(c);
}

const expired = hits.filter((h) => h.bucket === "expired");
const urgent = hits.filter((h) => h.bucket === "urgent");
const watch = hits.filter((h) => h.bucket === "watch");

function printSection(title, list) {
  console.log(`\n=== ${title} (${list.length}) ===`);
  for (const h of list) {
    console.log(
      JSON.stringify(
        {
          id: h.id,
          ageDays: h.ageDays,
          author: h.author,
          collection: h.collection,
          date: h.date,
          why: h.reasons.join("; "),
          url: h.url,
          text: h.text,
        },
        null,
        0
      )
    );
  }
}

printSection("EXPIRED / LIKELY USELESS NOW", expired);
printSection("ACT FAST (still potentially live)", urgent);
printSection("TIME-RELATED BUT UNCLEAR", watch);
console.log(
  `\nTOTAL time-related: ${hits.length} (expired ${expired.length}, urgent ${urgent.length}, unclear ${watch.length})`
);
