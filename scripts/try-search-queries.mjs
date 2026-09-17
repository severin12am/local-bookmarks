import fs from "fs";
import { loadQids } from "../src/lib/x/query-ids.ts";

const creds = JSON.parse(fs.readFileSync("data/sync-temp.json", "utf8"));
const qid = loadQids().BookmarkSearchTimeline;
const bearer =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const queries = [
  { rawQuery: "*", count: 20 },
  { rawQuery: "since:2006-01-01", count: 20 },
  { rawQuery: "the", count: 20 },
  { rawQuery: "a", count: 20 },
  { rawQuery: "https", count: 20 },
  { rawQuery: "filter:media", count: 20 },
  { rawQuery: "lang:en", count: 20 },
  { count: 20 },
  { rawQuery: "from:x", count: 20 },
];

const features = {
  responsive_web_graphql_timeline_navigation_enabled: true,
  graphql_timeline_v2_bookmark_timeline: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  rweb_video_timestamps_enabled: true,
  articles_preview_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_enhance_cards_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  rweb_tipjar_consumption_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  responsive_web_twitter_article_notes_tab_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
};

for (const variables of queries) {
  const path = `/i/api/graphql/${qid}/BookmarkSearchTimeline`;
  const url = `https://x.com${path}?variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}&features=${encodeURIComponent(JSON.stringify(features))}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${bearer}`,
      "x-csrf-token": creds.ct0,
      cookie: `auth_token=${creds.authToken}; ct0=${creds.ct0}`,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      referer: "https://x.com/i/bookmarks",
    },
  });
  const json = await res.json().catch(() => null);
  const err =
    json?.errors?.[0]?.message ||
    (typeof json === "object" ? null : String(json).slice(0, 120));
  const hasData = Boolean(json?.data);
  const text = JSON.stringify(json).slice(0, 220);
  console.log(
    JSON.stringify(variables),
    res.status,
    hasData ? "HAS_DATA" : "no_data",
    err || text
  );
}
