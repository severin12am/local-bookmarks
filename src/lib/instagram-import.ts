import type { NormalizedBookmark } from "./import-parser";
import {
  canonicalInstagramUrl,
  extractInstagramLinks,
  parseInstagramUrl,
  type ExtractedInstagramLink,
} from "./instagram-links";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PREVIEW_CAP = 80;

function og(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m = re.exec(html) || re2.exec(html);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

type Preview = {
  title: string | null;
  description: string | null;
  image: string | null;
  ogUrl: string | null;
  finalUrl: string | null;
};

const EMPTY_PREVIEW: Preview = {
  title: null,
  description: null,
  image: null,
  ogUrl: null,
  finalUrl: null,
};

async function fetchPreview(url: string): Promise<Preview> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    return {
      title: og(html, "og:title") || og(html, "twitter:title"),
      description: og(html, "og:description") || og(html, "twitter:description"),
      image: og(html, "og:image") || og(html, "twitter:image"),
      ogUrl: og(html, "og:url"),
      finalUrl: res.url || null,
    };
  } catch {
    return EMPTY_PREVIEW;
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

function applyResolvedUrl(link: ExtractedInstagramLink, candidate: string | null): ExtractedInstagramLink {
  if (!candidate) return link;
  const parsed = parseInstagramUrl(candidate);
  if (!parsed || parsed.kind === "share") return link;
  return {
    ...link,
    shortcode: parsed.shortcode,
    kind: parsed.kind,
    url: canonicalInstagramUrl(parsed.kind, parsed.shortcode),
  };
}

function authorFromTitle(title: string | null): { name: string; username: string } {
  if (!title) return { name: "Instagram", username: "instagram" };
  const by = /(?:reel|video|post|photo)\s+by\s+@?([A-Za-z0-9._]+)/i.exec(title);
  if (by?.[1]) {
    return { name: by[1], username: by[1].toLowerCase() };
  }
  const cleaned = title.replace(/\s+on Instagram$/i, "").trim();
  const at = /@([A-Za-z0-9._]+)/.exec(cleaned);
  if (at?.[1]) return { name: at[1], username: at[1].toLowerCase() };
  return { name: cleaned.slice(0, 80) || "Instagram", username: "instagram" };
}

export async function instagramLinksToBookmarks(
  raw: string
): Promise<NormalizedBookmark[]> {
  const links = extractInstagramLinks(raw);
  if (links.length === 0) return [];

  const shouldFetch = (link: ExtractedInstagramLink, index: number) =>
    link.kind === "share" || index < PREVIEW_CAP;

  const fetched = await mapPool(
    links.map((link, index) => ({ link, index })),
    4,
    async ({ link, index }) => {
      if (!shouldFetch(link, index)) return { link, preview: EMPTY_PREVIEW };
      const preview = await fetchPreview(link.url);
      const resolved = applyResolvedUrl(
        applyResolvedUrl(link, preview.finalUrl),
        preview.ogUrl
      );
      return { link: resolved, preview };
    }
  );

  const seen = new Set<string>();
  const out: NormalizedBookmark[] = [];
  for (const row of fetched) {
    if (!row) continue;
    const { link, preview } = row;
    const id = `ig:${link.shortcode}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const author = authorFromTitle(preview.title);
    const title =
      preview.title?.replace(/\s+on Instagram$/i, "").trim() ||
      `Instagram ${link.kind} ${link.shortcode}`;
    const text = [title, preview.description].filter(Boolean).join("\n\n");
    out.push({
      tweetId: id,
      text,
      authorName: author.name,
      authorUsername: author.username,
      authorAvatarUrl: null,
      tweetCreatedAt: link.sentAt,
      url: link.url,
      media: preview.image
        ? [{ url: preview.image, type: "photo", previewUrl: preview.image }]
        : [],
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      notes: `Imported from Instagram / Messages (${link.kind})`,
      tags: ["instagram", link.kind === "post" ? "post" : "reel"],
      collectionName: "Instagram",
      rawJson: JSON.stringify({ source: "instagram-messages", ...link, preview }),
    });
  }
  return out;
}
