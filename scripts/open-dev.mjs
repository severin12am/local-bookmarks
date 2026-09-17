import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickPort() {
  const preferred = Number(process.env.PORT) || 3000;
  for (const port of [preferred, 3001, 3002, 3003]) {
    if (await portFree(port)) return port;
  }
  throw new Error("No free port between 3000 and 3003");
}

async function waitFor(url, ms = 90000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn(platform === "darwin" ? "open" : "xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

if (!process.versions.node || Number(process.versions.node.split(".")[0]) < 20) {
  console.error("Node.js 20+ is required. Install it from https://nodejs.org/");
  process.exit(1);
}

const needInstall = !existsSync(path.join(root, "node_modules", "next"));
if (needInstall) {
  console.log("First run: installing dependencies…");
  await run("npm", ["install"]);
}

const port = await pickPort();
const url = `http://localhost:${port}`;
console.log(`Starting Local Bookmarks on ${url}`);

const child = spawn("npx", ["next", "dev", "--port", String(port)], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PORT: String(port) },
});

child.on("exit", (code) => process.exit(code ?? 0));

try {
  await waitFor(url);
  openBrowser(url);
  console.log(`Opened ${url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
}
