import type { NormalizedBookmark } from "@/lib/import-parser";
import {
  loadCredentials,
  parseCredentialInput,
  saveCredentials,
  toCookieHeader,
  type XCredentials,
} from "./credentials";
import { graphqlError, parseBookmarksResponse } from "./parse-bookmarks";
import { loadQids, refreshQueryIds, saveQids, setBookmarksQid } from "./query-ids";
import { getTransactionId } from "./txid";

const DEFAULT_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Known-good Bookmarks query IDs (X still accepts these even when missing from bundles). */
const BOOKMARKS_QID_FALLBACKS = [
  "Z9GWmP0kP2dajyckAaDUBw",
  "-LGfdImKeQz0xS_jjUwzlA",
];

const FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  rweb_video_timestamps_enabled: true,
  articles_preview_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  rweb_tipjar_consumption_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  responsive_web_twitter_article_notes_tab_enabled: true,
};

export type SyncProgress = {
  fetched: number;
  pages: number;
  status: string;
};

export type FetchBookmarksResult = {
  bookmarks: NormalizedBookmark[];
  pages: number;
};

function buildHeaders(creds: XCredentials, txid: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${DEFAULT_BEARER}`,
    "x-csrf-token": creds.ct0,
    cookie: toCookieHeader(creds),
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "content-type": "application/json",
    "user-agent": UA,
    accept: "*/*",
    referer: "https://x.com/i/bookmarks",
    origin: "https://x.com",
  };
  if (txid) headers["x-client-transaction-id"] = txid;
  return headers;
}

function resolveBookmarksQid(): string {
  const qids = loadQids();
  return (
    process.env.X_BOOKMARKS_QID ||
    qids.Bookmarks ||
    BOOKMARKS_QID_FALLBACKS[0]!
  );
}

async function fetchBookmarksPage(
  creds: XCredentials,
  qid: string,
  cursor: string | null
): Promise<{ bookmarks: NormalizedBookmark[]; nextCursor: string | null; status: number }> {
  const variables: Record<string, unknown> = {
    count: 100,
    includePromotedContent: false,
    ...(cursor ? { cursor } : {}),
  };

  const path = `/i/api/graphql/${qid}/Bookmarks`;
  const txid = await getTransactionId("GET", path);
  const url = `https://x.com${path}?variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}&features=${encodeURIComponent(JSON.stringify(FEATURES))}`;

  const res = await fetch(url, {
    headers: buildHeaders(creds, txid),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "X rejected the session (401/403). Your auth_token/ct0 may have expired — grab fresh cookies from x.com while logged in."
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      bookmarks: [],
      nextCursor: null,
      status: res.status,
    };
  }

  const json: unknown = await res.json();
  const err = graphqlError(json);
  if (err) throw new Error(err);

  const parsed = parseBookmarksResponse(json);
  return { ...parsed, status: 200 };
}

async function pickWorkingQid(creds: XCredentials): Promise<string> {
  const candidates = [
    process.env.X_BOOKMARKS_QID,
    loadQids().Bookmarks,
    ...BOOKMARKS_QID_FALLBACKS,
  ].filter((v): v is string => Boolean(v));

  const unique = [...new Set(candidates)];

  for (const qid of unique) {
    const page = await fetchBookmarksPage(creds, qid, null);
    if (page.status === 200) {
      const qids = loadQids();
      qids.Bookmarks = qid;
      saveQids(qids);
      return qid;
    }
  }

  // Last resort: refresh bundles then try BookmarkSearchTimeline is handled by caller
  throw new Error(
    "Could not reach X Bookmarks API with known endpoints. Re-copy fresh auth_token/ct0 and try again."
  );
}

export async function fetchAllBookmarks(options?: {
  authToken?: string;
  ct0?: string;
  cookie?: string;
  bookmarksQueryId?: string;
  save?: boolean;
  maxPages?: number;
  onProgress?: (p: SyncProgress) => void;
}): Promise<FetchBookmarksResult> {
  let creds = loadCredentials();

  const parsed = parseCredentialInput({
    authToken: options?.authToken,
    ct0: options?.ct0,
    cookie: options?.cookie,
  });

  if (parsed) {
    creds =
      options?.save === false
        ? { ...parsed, savedAt: new Date().toISOString() }
        : saveCredentials(parsed.authToken, parsed.ct0);
  }

  if (!creds) {
    throw new Error(
      "No X session saved. Paste your auth_token and ct0 cookies from x.com."
    );
  }

  if (options?.bookmarksQueryId?.trim()) {
    setBookmarksQid(options.bookmarksQueryId.trim());
  }

  options?.onProgress?.({
    fetched: 0,
    pages: 0,
    status: "Connecting to X Bookmarks…",
  });

  // Warm query-id cache in background (non-fatal)
  void refreshQueryIds(toCookieHeader(creds)).catch(() => undefined);

  let qid = options?.bookmarksQueryId?.trim() || resolveBookmarksQid();

  const all: NormalizedBookmark[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = options?.maxPages ?? 200;

  // First page also acts as endpoint probe
  {
    let first = await fetchBookmarksPage(creds, qid, null);
    if (first.status !== 200) {
      qid = await pickWorkingQid(creds);
      first = await fetchBookmarksPage(creds, qid, null);
      if (first.status !== 200) {
        throw new Error(`X returned HTTP ${first.status} for Bookmarks`);
      }
    }
    pages = 1;
    for (const b of first.bookmarks) {
      if (seen.has(b.tweetId)) continue;
      seen.add(b.tweetId);
      all.push(b);
    }
    cursor = first.nextCursor;
    if (!cursor || first.bookmarks.length === 0) {
      return { bookmarks: all, pages };
    }
  }

  while (pages < maxPages) {
    pages += 1;
    options?.onProgress?.({
      fetched: all.length,
      pages,
      status: `Fetching page ${pages}…`,
    });

    const page = await fetchBookmarksPage(creds, qid, cursor);
    if (page.status !== 200) {
      throw new Error(`X returned HTTP ${page.status} while paging bookmarks`);
    }

    for (const b of page.bookmarks) {
      if (seen.has(b.tweetId)) continue;
      seen.add(b.tweetId);
      all.push(b);
    }

    if (!page.nextCursor || page.bookmarks.length === 0) break;
    if (page.nextCursor === cursor) break;
    cursor = page.nextCursor;

    await new Promise((r) => setTimeout(r, 350));
  }

  options?.onProgress?.({
    fetched: all.length,
    pages,
    status: `Fetched ${all.length} bookmarks`,
  });

  return { bookmarks: all, pages };
}
