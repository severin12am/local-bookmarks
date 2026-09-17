import fs from "fs";
import path from "path";

export type XCredentials = {
  authToken: string;
  ct0: string;
  savedAt: string;
};

function credentialsPath() {
  return path.join(process.cwd(), "data", "x-credentials.json");
}

export function loadCredentials(): XCredentials | null {
  try {
    const raw = fs.readFileSync(credentialsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<XCredentials>;
    if (!parsed.authToken || !parsed.ct0) return null;
    return {
      authToken: parsed.authToken,
      ct0: parsed.ct0,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveCredentials(authToken: string, ct0: string): XCredentials {
  const creds: XCredentials = {
    authToken: authToken.trim(),
    ct0: ct0.trim(),
    savedAt: new Date().toISOString(),
  };
  const dir = path.dirname(credentialsPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
  return creds;
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(credentialsPath());
  } catch {
    // ignore
  }
}

export function toCookieHeader(creds: XCredentials): string {
  return `auth_token=${creds.authToken}; ct0=${creds.ct0}`;
}

function findCookie(header: string, key: string): string | null {
  return new RegExp(`(?:^|[;\\s])${key}=([^;\\s]+)`, "i").exec(header)?.[1] ?? null;
}

function parseCookieBlob(raw: string): { authToken: string; ct0: string } | null {
  let header = raw.trim();
  if (!header) return null;

  if (header.startsWith("{")) {
    try {
      const obj = JSON.parse(header) as { cookies?: unknown };
      if (Array.isArray(obj.cookies)) header = JSON.stringify(obj.cookies);
    } catch {
      // not JSON
    }
  }

  if (header.startsWith("[")) {
    try {
      const arr = JSON.parse(header) as Array<{ name?: string; value?: string }>;
      if (Array.isArray(arr)) {
        header = arr
          .filter((c) => c.name && c.value)
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
      }
    } catch {
      return null;
    }
  }

  let authToken = findCookie(header, "auth_token");
  let ct0 = findCookie(header, "ct0");

  if (!authToken || !ct0) {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2 && !lines[0]!.includes("=")) {
      authToken = authToken || lines[0]!;
      ct0 = ct0 || lines[1]!;
    }
  }

  if (!authToken || !ct0) return null;
  return { authToken, ct0 };
}

/** Cookie-Editor JSON, cookie header, two lines, or separate tokens. */
export function parseCredentialInput(input: {
  authToken?: string;
  ct0?: string;
  cookie?: string;
}): { authToken: string; ct0: string } | null {
  if (input.authToken?.trim() && input.ct0?.trim()) {
    return { authToken: input.authToken.trim(), ct0: input.ct0.trim() };
  }
  const blob = [input.cookie, input.authToken, input.ct0]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n");
  return parseCookieBlob(blob);
}
