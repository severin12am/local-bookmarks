const PORTS = [3000, 3001, 3002, 3003];

const statusEl = document.getElementById("status");
const button = document.getElementById("sync");

function setStatus(text, cls) {
  statusEl.className = cls || "";
  statusEl.textContent = text;
}

async function cookie(name) {
  const fromX = await chrome.cookies.get({ url: "https://x.com/", name });
  if (fromX?.value) return fromX.value;
  const fromTwitter = await chrome.cookies.get({
    url: "https://twitter.com/",
    name,
  });
  return fromTwitter?.value || null;
}

async function post(port, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/sync/x`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.busy = res.status !== 0;
    throw err;
  }
  return json;
}

async function syncToLocal(body) {
  let last = new Error("Could not reach Local Bookmarks. Run start.bat first.");
  for (const port of PORTS) {
    try {
      return await post(port, body);
    } catch (error) {
      last = error;
      if (error && error.busy) continue;
    }
  }
  throw last;
}

button.addEventListener("click", async () => {
  button.disabled = true;
  setStatus("Reading X cookies…");
  try {
    const authToken = await cookie("auth_token");
    const ct0 = await cookie("ct0");
    if (!authToken || !ct0) {
      throw new Error("Log into x.com in this browser, then try again.");
    }
    setStatus("Syncing…");
    const res = await syncToLocal({ authToken, ct0, save: true });
    setStatus(
      `Done. ${res.imported ?? 0} new, ${res.skipped ?? 0} already saved.`,
      "ok"
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "err");
  } finally {
    button.disabled = false;
  }
});
