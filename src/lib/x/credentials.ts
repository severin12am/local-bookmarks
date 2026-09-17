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

/** Accept Cookie-Editor JSON, raw cookie header, or separate tokens. */
export function parseCredentialInput(input: {
  authToken?: string;
  ct0?: string;
  cookie?: string;
}): { authToken: string; ct0: string } | null {
  if (input.authToken?.trim() && input.ct0?.trim()) {
    return { authToken: input.authToken.trim(), ct0: input.ct0.trim() };
  }

  const cookie = input.cookie?.trim();
  if (!cookie) return null;

  let header = cookie;
  if (cookie.startsWith("[")) {
    try {
      const arr = JSON.parse(cookie) as Array<{ name?: string; value?: string }>;
      if (!Array.isArray(arr)) return null;
      header = arr
        .filter((c) => c.name && c.value)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
    } catch {
      return null;
    }
  }

  const find = (key: string) =>
    new RegExp(`(?:^|;\\s*)${key}=([^;]+)`).exec(header)?.[1];
  const authToken = find("auth_token");
  const ct0 = find("ct0");
  if (!authToken || !ct0) return null;
  return { authToken, ct0 };
}
