"use client";

import type { ReactNode } from "react";
import { ConnectDialog } from "@/components/connect-dialog";
import {
  InstagramConnectSteps,
  TelegramConnectSteps,
  XConnectSteps,
} from "@/components/connect-steps";
import { Button } from "@/components/ui/button";

type Props = {
  onChanged: () => void;
};

export function GettingStarted({ onChanged }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-6">
      <div className="text-center">
        <h2 className="text-xl font-medium text-zinc-50">
          Add your first bookmarks
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Everything stays on this computer. Pick a source and follow the steps.
          After import, click Categorize — it sorts by keywords, no API key.
        </p>
      </div>

      <Guide
        title="X bookmarks"
        action={
          <ConnectDialog
            startTab="x"
            onChanged={onChanged}
            trigger={
              <Button size="sm" variant="secondary">
                Open X steps
              </Button>
            }
          />
        }
      >
        <XConnectSteps />
      </Guide>

      <Guide
        title="Telegram Saved Messages"
        action={
          <ConnectDialog
            startTab="telegram"
            onChanged={onChanged}
            trigger={
              <Button size="sm" variant="secondary">
                Open Telegram steps
              </Button>
            }
          />
        }
      >
        <TelegramConnectSteps />
      </Guide>

      <Guide
        title="Instagram reels"
        action={
          <ConnectDialog
            startTab="instagram"
            onChanged={onChanged}
            trigger={
              <Button size="sm" variant="secondary">
                Open Instagram steps
              </Button>
            }
          />
        }
      >
        <InstagramConnectSteps />
      </Guide>
    </div>
  );
}

function Guide({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
