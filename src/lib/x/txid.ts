import {
  ClientTransaction,
  generateHeaders,
  getOndemandFileUrl,
  handleXMigrationAsync,
  type RequestOptions,
  type SessionLike,
} from "@hardbrick21/x-txid-generator";

let cached: {
  transaction: ClientTransaction;
  expiresAt: number;
} | null = null;

const TTL_MS = 30 * 60 * 1000;

export async function getTransactionId(
  method: string,
  path: string
): Promise<string | null> {
  try {
    const now = Date.now();
    if (!cached || cached.expiresAt < now) {
      const headers = generateHeaders();
      const session: SessionLike = {
        async request(
          optionsOrMethod: RequestOptions | string,
          url?: string,
          data?: Record<string, string>
        ) {
          const opts: RequestOptions =
            typeof optionsOrMethod === "string"
              ? { method: optionsOrMethod, url: url!, data }
              : optionsOrMethod;

          const res = await fetch(opts.url, {
            method: opts.method,
            headers,
            body: opts.data ? new URLSearchParams(opts.data) : undefined,
          });
          return { content: await res.text() };
        },
      };

      const homePageHtml = await handleXMigrationAsync(session);
      const ondemandUrl = getOndemandFileUrl(homePageHtml);
      const ondemandJs = await (
        await fetch(ondemandUrl, { headers })
      ).text();
      cached = {
        transaction: new ClientTransaction(homePageHtml, ondemandJs),
        expiresAt: now + TTL_MS,
      };
    }

    return cached.transaction.generateTransactionId(method, path);
  } catch (error) {
    console.warn("Failed to generate x-client-transaction-id", error);
    return null;
  }
}
