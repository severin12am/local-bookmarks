export type InstagramKind = "reel" | "post" | "tv" | "share";

export type ExtractedInstagramLink = {
  shortcode: string;
  kind: InstagramKind;
  url: string;
  sentAt: string | null;
};

const PATH_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:share\/(reel|p|r)\/|(?:(?:[A-Za-z0-9._]+)\/)?(reels?|p|tv)\/)([A-Za-z0-9_-]+)/i;

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\\u0026/g, "&");
}

function attr(tag: string, name: string): string | null {
  const m =
    new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag) ||
    new RegExp(`\\b${name}='([^']*)'`, "i").exec(tag);
  return m ? decodeXml(m[1]) : null;
}

function kindFrom(pathKind: string | undefined, shareKind: string | undefined): InstagramKind {
  if (shareKind) return "share";
  const k = (pathKind || "").toLowerCase();
  if (k === "p") return "post";
  if (k === "tv") return "tv";
  return "reel";
}

export function canonicalInstagramUrl(kind: InstagramKind, shortcode: string): string {
  if (kind === "post") return `https://www.instagram.com/p/${shortcode}/`;
  if (kind === "tv") return `https://www.instagram.com/tv/${shortcode}/`;
  return `https://www.instagram.com/reel/${shortcode}/`;
}

function linkId(kind: InstagramKind, shortcode: string): string {
  return kind === "share" ? `share:${shortcode}` : shortcode;
}

export function parseInstagramUrl(rawUrl: string): Omit<ExtractedInstagramLink, "sentAt"> | null {
  const decoded = unfoldRedirects(decodeXml(rawUrl)).trim();
  const m = PATH_RE.exec(decoded);
  if (!m?.[3]) return null;
  const kind = kindFrom(m[2], m[1]);
  const shortcode = m[3];
  const url =
    kind === "share"
      ? `https://www.instagram.com/share/${m[1] === "p" ? "p" : "reel"}/${shortcode}/`
      : canonicalInstagramUrl(kind, shortcode);
  return { shortcode, kind, url };
}

function collectFromText(
  text: string,
  sentAt: string | null,
  into: Map<string, ExtractedInstagramLink>
) {
  const decoded = unfoldRedirects(decodeXml(text));
  const re = new RegExp(PATH_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(decoded))) {
    const kind = kindFrom(m[2], m[1]);
    const shortcode = m[3];
    if (!shortcode) continue;
    const id = linkId(kind, shortcode);
    const existing = into.get(id);
    const sent =
      sentAt && (!existing?.sentAt || sentAt < existing.sentAt)
        ? sentAt
        : existing?.sentAt ?? sentAt;
    const url =
      kind === "share"
        ? `https://www.instagram.com/share/${m[1] === "p" ? "p" : "reel"}/${shortcode}/`
        : canonicalInstagramUrl(kind, shortcode);
    into.set(id, {
      shortcode,
      kind,
      url: existing?.url ?? url,
      sentAt: sent,
    });
  }
}

function millisToIso(value: string | null): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1e11) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function unfoldRedirects(text: string): string {
  let out = text.replace(
    /https?:\/\/l\.instagram\.com\/\?u=([^&\s"']+)/gi,
    (_, encoded: string) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }
  );
  out = out.replace(
    /https?:\/\/(?:www\.)?google\.com\/url\?[^\s"'<>]*/gi,
    (full) => {
      try {
        const u = new URL(full);
        return u.searchParams.get("q") || u.searchParams.get("url") || full;
      } catch {
        return full;
      }
    }
  );
  return out.replace(
    /(^|[\s"'<(])(?:www\.)?instagram\.com\//gi,
    "$1https://www.instagram.com/"
  );
}

/** Pull unique Instagram reel/post links from paste, SMS XML, or HTML. */
export function extractInstagramLinks(raw: string): ExtractedInstagramLink[] {
  const into = new Map<string, ExtractedInstagramLink>();
  const text = unfoldRedirects(raw || "");

  for (const tag of text.matchAll(/<(sms|mms)\b[^>]*>/gi)) {
    const body = attr(tag[0], "body");
    const date = millisToIso(attr(tag[0], "date"));
    if (body) collectFromText(body, date, into);
  }

  for (const tag of text.matchAll(/<part\b[^>]*>/gi)) {
    const partText = attr(tag[0], "text");
    if (partText) collectFromText(partText, null, into);
  }

  collectFromText(text, null, into);

  return [...into.values()].sort((a, b) => {
    if (a.sentAt && b.sentAt) return a.sentAt < b.sentAt ? 1 : -1;
    if (a.sentAt) return -1;
    if (b.sentAt) return 1;
    return 0;
  });
}
