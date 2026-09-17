# Local Bookmarks

Local library for **X bookmarks**, **Telegram Saved Messages**, and **Instagram reels**. No cloud account. MIT.

Clone, start, click **Connect**. Everything stays on your computer.

## Setup

1. Install [Node.js 20+](https://nodejs.org/) (LTS) if you do not have it.
2. Clone this repo, then start it:

```bash
git clone https://github.com/severin12am/local-bookmarks.git
cd local-bookmarks
```

- **Windows:** double-click `start.bat`
- **Mac / Linux:** `chmod +x start.sh && ./start.sh`

The first run installs packages, starts the app, and opens your browser. That is the whole setup.

If nothing opens: `npm install` then `npm run dev`, and visit [http://localhost:3000](http://localhost:3000) (or **3001** if 3000 is taken).

## Connect sources

Click **Connect** in the app header.

### X

1. Stay logged into [x.com](https://x.com) in Chrome or Edge.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. **Load unpacked** → choose the `extension` folder in this project.
5. Click the extension → **Sync X bookmarks**.

The session is stored in local `data/` only. If the extension is blocked: Connect → X → paste cookies (Cookie-Editor JSON, a Cookie header, or `auth_token` and `ct0` on two lines).

If sync times out, turn on a VPN and try again.

### Telegram

You do **not** forward Saved Messages one by one.

1. Connect → Telegram → phone number in international format (`+15551234567`).
2. One-time: open [my.telegram.org](https://my.telegram.org) → log in → **API development tools** → create an app → paste `api_id` and `api_hash`.
3. Enter the login code Telegram sends (and the two-step password if you use one).

The app then reads **Saved Messages** while it is running. Telegram lists this device as **Local Bookmarks** (Settings → Devices). Disconnect in the app to sign it out.

The first sync takes the latest ~200 saved items. For full history: Telegram Desktop → Settings → Advanced → Export Telegram data → JSON → Saved Messages → drop `result.json` on the same tab.

Optional bot fallback (forward selected chats only): `@BotFather` → `/newbot` → paste the token under **Bot fallback**.

### Instagram

Paste `instagram.com/reel/…` links, or drop an SMS backup of the Google Messages thread you send reels to.

## If something is stuck

- **Loading library… forever:** close the terminal and run `start.bat` / `start.sh` again.
- **Wrong port:** the start script uses 3000, then 3001–3003 if busy.
- **Telegram code expired:** click **Send code** again.
- **X session expired:** sync from the extension while you are logged into x.com.

## Privacy

- SQLite, X cookies, and the Telegram session live in gitignored `data/`. Do not commit that folder.
- X sync uses your browser session (unofficial; sessions expire). Telegram user login uses [MTProto](https://core.telegram.org/mtproto) (unofficial client). Not affiliated with X, Telegram, or Meta.

## License

[MIT](LICENSE)
