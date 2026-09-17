# Local Bookmarks

A **local** library for things that never become a Chrome bookmark:

- **X (Twitter) bookmarks** — sync the native bookmark list
- **Telegram Saved Messages** — official Desktop JSON/HTML export
- **Instagram reels** — paste links, or an SMS / Google Messages backup

No account, no cloud, no paid API. SQLite on your machine. MIT licensed.

This is not Raindrop, linkding, or a browser-bookmark manager. Those tools are better if you save tabs from an extension. Use this when the save lives inside X, Instagram, or Telegram.

## Setup

Needs [Node.js 20+](https://nodejs.org/).

```bash
git clone https://github.com/severin12am/local-bookmarks.git
cd local-bookmarks
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is created at `data/bookmarks.db` (gitignored).

That is the whole setup.

## Add bookmarks

### X (live sync)

Unofficial: the app uses your logged-in browser session, not the X developer API. Sessions expire; paste new cookies when sync fails. Not affiliated with X.

1. Click **Sync from X**
2. On [x.com](https://x.com) while logged in: DevTools → Application → Cookies → `https://x.com`
3. Copy `auth_token` and `ct0`, paste, Sync

Cookies stay in local `data/x-credentials.json` (gitignored). Re-sync anytime; duplicates are skipped.

### Telegram Saved Messages

Official Desktop export — the app does not log into Telegram.

1. Telegram Desktop → **Settings → Advanced → Export Telegram data**
2. Format: **JSON**
3. Uncheck everything except **Saved Messages** (or export only that chat)
4. Click **Import** and drop `result.json`  
   If you exported the whole account, use the chat file: `chats/chat_XXX/result.json`, not the root index.

HTML export (`messages.html`) also works. Public `t.me/...` links can be pasted.

### Instagram reels

The app does not log into Instagram. Typical save flow: send the reel to your 2nd account, or share it into Google Messages.

1. Click **Import**
2. Paste `instagram.com/reel/…` links, **or**
3. Android: SMS Backup & Restore → export the Messages thread that has the links → drop the XML

Reel-only Telegram saves are stored under **Instagram**; notes and forwarded posts stay under **Telegram**.

### X JSON (optional)

If you already have a bookmarks JSON dump, drop it on **Import**. Prefer Sync from X. A tiny fake dump is in `sample-bookmarks.json`.

## Features

- Search across text, authors, and notes
- Tags, collections, personal notes
- Favorite / read-unread
- Filters: tags, collections, favorites, unread, media, author
- Auto-categorize (edit rules in `src/lib/categorize.ts`)
- Bulk select: tag, move, star, mark read, delete
- Export library back to JSON
- Keyboard: `/` focus search, `Esc` clear selection

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:studio` | Open Drizzle Studio |

## Privacy

- Designed for local use (`better-sqlite3` is a native Node module).
- Do not commit `data/` or `exports/` — they can contain your library and X session cookies.
- Instagram previews use public Open Graph pages; some reels import as URL-only if Meta blocks the fetch.

## License

[MIT](LICENSE)
