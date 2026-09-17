import type { ReactNode } from "react";

export function StepList({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-400 marker:font-medium marker:text-zinc-500">
      {children}
    </ol>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.8rem] text-zinc-200">
      {children}
    </code>
  );
}

export function XConnectSteps() {
  return (
    <StepList>
      <li>
        Stay logged into <span className="text-zinc-200">x.com</span> in Chrome
        or Edge.
      </li>
      <li>
        Open <Code>chrome://extensions</Code> (Edge:{" "}
        <Code>edge://extensions</Code>).
      </li>
      <li>Turn on Developer mode (top right).</li>
      <li>
        Load unpacked → select the <Code>extension</Code> folder inside this
        project.
      </li>
      <li>
        Click the extension icon → <span className="text-zinc-200">Sync X bookmarks</span>.
        Keep this app running.
      </li>
    </StepList>
  );
}

export function TelegramConnectSteps() {
  return (
    <StepList>
      <li>
        Enter your phone number in international format, like{" "}
        <Code>+15551234567</Code>.
      </li>
      <li>
        One-time: open{" "}
        <a
          className="text-sky-400 hover:text-sky-300"
          href="https://my.telegram.org"
          target="_blank"
          rel="noreferrer"
        >
          my.telegram.org
        </a>
        , log in, open <span className="text-zinc-200">API development tools</span>,
        create an app, then paste <Code>api_id</Code> and <Code>api_hash</Code>{" "}
        in the fields. Telegram requires this to let any app read Saved Messages.
      </li>
      <li>
        Click Send code, then paste the login code Telegram sends (and your
        two-step password if you use one).
      </li>
      <li>
        After that, Saved Messages sync by themselves while the app is running.
        No forwarding.
      </li>
    </StepList>
  );
}

export function InstagramConnectSteps() {
  return (
    <StepList>
      <li>
        Copy <Code>instagram.com/reel/…</Code> links (from Instagram, or from
        the chat you send reels to).
      </li>
      <li>Paste them in the box, or drop an SMS backup XML of that Messages thread.</li>
      <li>
        Click <span className="text-zinc-200">Import reels</span>.
      </li>
    </StepList>
  );
}
