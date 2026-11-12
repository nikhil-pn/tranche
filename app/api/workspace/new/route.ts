// Start a fresh demo project. The server signs it; the browser carries it from then on.

import { iso } from "@/lib/dates";
import { paypalConfigured } from "@/lib/paypal/rest";
import { makeSeed } from "@/lib/seed";
import { errorResponse, json, rateLimit, seal } from "@/lib/server";
import { randomId } from "@/lib/sign";

export async function POST(request: Request) {
  try {
    rateLimit(request, "new", 20, 60_000);
    const crewEmails = (process.env.TRANCHE_CREW_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const ws = makeSeed({
      id: randomId("ws"),
      today: iso(new Date()),
      mode: paypalConfigured() ? "sandbox" : "mock",
      clientEmail: process.env.TRANCHE_CLIENT_EMAIL || undefined,
      crewEmails: crewEmails.length >= 3 ? crewEmails : undefined,
    });
    return json(seal(ws));
  } catch (err) {
    return errorResponse(err);
  }
}
