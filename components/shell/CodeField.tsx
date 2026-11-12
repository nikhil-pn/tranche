"use client";

import { useState } from "react";
import { useTranche } from "@/lib/client/store";
import { Button } from "./ui";

/** Shown when the server wants an access code, or refused the stored one. */
export function CodeField({ onSaved }: { onSaved?: () => void }) {
  const { setCode, code, config } = useTranche();
  const [draft, setDraft] = useState("");
  const refused = code.length > 0;
  return (
    <form
      className="rounded-lg border border-line bg-paper p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        setCode(draft);
        setDraft("");
        onSaved?.();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink">Demo access code</span>
        <span className="text-[12.5px] leading-[1.4] text-ink-2">
          {refused
            ? "That code was not accepted. Check it and try again."
            : config?.needsCode
              ? "This demo makes real PayPal sandbox and Claude calls, so it asks for a code first."
              : "The server asked for an access code."}
        </span>
        <span className="mt-0.5 flex gap-2">
          <input
            className="num h-8 min-w-0 flex-1 rounded-md border border-line bg-card px-2.5 text-[13px] outline-none focus:border-ink-3"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Access code"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            Save
          </Button>
        </span>
      </label>
    </form>
  );
}
