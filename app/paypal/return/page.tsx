"use client";

// PayPal sends the client here after they approve (or cancel) the deposit hold.
// This tab only pokes the main tab through localStorage; the main tab then asks PayPal what happened.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const POKE_KEY = "tranche.poke";

function Returned() {
  const params = useSearchParams();
  const cancelled = params.get("cancelled") === "1" || params.get("canceled") === "1";
  const orderId = params.get("token");

  useEffect(() => {
    try {
      window.localStorage.setItem(POKE_KEY, String(Date.now()));
    } catch {
      // Storage blocked: the main tab still checks PayPal when it gets focus.
    }
  }, []);

  return (
    <>
      <h1 className="display text-[30px] leading-9 text-ink">
        {cancelled ? "Approval cancelled." : "PayPal approval received."}
      </h1>
      {orderId ? (
        <p className="mt-3 text-[13px] text-ink-2">
          Order <span className="num text-ink">{orderId}</span>
        </p>
      ) : null}
      <p className="mt-3 text-[14px] leading-[1.5] text-ink-2">
        You can close this tab and go back to Tranche. The plan will update on its own.
      </p>
    </>
  );
}

export default function PayPalReturnPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-line bg-card px-7 py-7">
        <p className="display text-[22px] leading-none text-ink-2">Tranche</p>
        <div className="mt-5">
          <Suspense fallback={<p className="text-[14px] text-ink-2">Reading the reply from PayPal.</p>}>
            <Returned />
          </Suspense>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-paper hover:bg-ink/85"
        >
          Back to Tranche
        </Link>
      </div>
    </main>
  );
}
