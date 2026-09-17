import fs from "fs";

const creds = JSON.parse(fs.readFileSync("data/sync-temp.json", "utf8"));
const bearer =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const candidates = [
  ["Bookmarks", "ZYKSe-w7KEslx3JhSIk5LA"],
  ["Bookmarks", "Z9GWmP0kP2dajyckAaDUBw"],
  ["Bookmarks", "-LGfdImKeQz0xS_jjUwzlA"],
  ["Bookmarks", "gDtNpR8w0s5ylv5Y4M4mPA"],
  ["Bookmarks", "BtT87l928V4JJYrq5SEIKg"],
];

const features = {
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

for (const [op, qid] of candidates) {
  const variables = { count: 20, includePromotedContent: false };
  const url = `https://x.com/i/api/graphql/${qid}/${op}?variables=${encodeURIComponent(
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
  const text = await res.text();
  console.log(op, qid, res.status, text.slice(0, 160).replace(/\s+/g, " "));
}
