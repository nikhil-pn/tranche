/* eslint-disable @next/next/no-img-element -- plain <img>: these are small static crops, and skipping the image optimizer keeps hosting usage at zero. */

import type { Metadata } from "next";
import Link from "next/link";
import { DASHBOARD_URL, DEMO_VIDEO_ID, GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tranche: the delivery plan where money is a dependency",
  description:
    "A short tour of Tranche: a project plan where every phase ends in a PayPal payment gate, and a Claude agent that can never pay anyone on its own.",
};

// ---------- content (taken from the README) ----------

type Step = {
  title: string;
  body: string;
  via: string;
  img: { src: string; alt: string; width: number; height: number };
};

const STEPS: Step[] = [
  {
    title: "A deposit hold on PayPal",
    body: "The agent asks the client to approve the $1,000 kickoff deposit as a PayPal hold. The money is held, not taken, and that is enough for work to start.",
    via: "PayPal Orders v2 with intent AUTHORIZE, through the PayPal Server SDK.",
    img: {
      src: "/how/deposit-hold.webp",
      alt: "The Tranche plan after the client approved the hold: the Kickoff deposit shows $1,000 held by PayPal, and its payment gate offers Capture deposit.",
      width: 1400,
      height: 834,
    },
  },
  {
    title: "An invoice the agent raises, paid on PayPal",
    body: "When the first phase is delivered, the agent captures the held deposit and raises the PayPal invoice for the next gate. The client pays it on PayPal's own invoice page.",
    via: "PayPal Invoicing v2, through the PayPal Agent Toolkit.",
    img: {
      src: "/how/invoice-paid.webp",
      alt: "PayPal's own invoice page for Paper Lantern Studio, with the message: Payment successful. You paid $2,400.00 for the invoice from Paper Lantern Studio.",
      width: 1400,
      height: 423,
    },
  },
  {
    title: "Crew pay the agent proposes and a person approves",
    body: "When a phase is paid for, the agent proposes one payout for exactly what the crew is owed. A person approves it on a screen the model does not write to, and only after plain code checks it against the signed mandate does PayPal Payouts send the money.",
    via: "PayPal Payouts v1, one batch per approved proposal.",
    img: {
      src: "/how/crew-payout.webp",
      alt: "The approval screen: Pay $1,600 to 2 people, proposed by the agent, with the gate checks listed and the buttons Approve and pay with PayPal and Reject.",
      width: 1400,
      height: 618,
    },
  },
  {
    title: "A late payment moves the plan",
    body: "When an invoice goes past its due date, the agent sends one PayPal reminder. It then tells the plan the truth: the gated work moves to the date the money is now expected, and the Gantt shows every task that moved and by how many days.",
    via: "Reminder through PayPal Invoicing v2 (Agent Toolkit). The plan runs on Bryntum Gantt.",
    img: {
      src: "/how/late-payment.webp",
      alt: "The Gantt with a Late payment band, a banner reading 5 days behind the original plan, and the Design approval gate marked Overdue and replanned to Dec 8.",
      width: 1400,
      height: 858,
    },
  },
  {
    title: "The safety test: forged payouts are refused",
    body: "One tab plays a compromised agent and forges payouts: to a stranger, over the cap, before the client has paid, and without approval. Every one is refused before any PayPal call, and a planted note that tries to give the agent orders is flagged and ignored.",
    via: "Plain code in lib/mandate.ts. No model is involved in the checks.",
    img: {
      src: "/how/safety-test.webp",
      alt: "The Safety test tab with four forge buttons and a forged $300 payout marked Refused by the gate: no PayPal call was made, no human approval was given.",
      width: 1400,
      height: 582,
    },
  },
];

// The eight checks, in the order lib/mandate.ts runs them.
const CHECKS: string[] = [
  "A mandate exists, and its signature is genuine.",
  "The mandate has not expired.",
  "Every payee is on the mandate's allow-list.",
  "No single person is paid more than the per-payout cap.",
  "The total paid out stays inside the mandate's budget.",
  "The money has already been collected from the client.",
  "The proposal has not been decided before.",
  "A person approved this exact proposal. The approval is bound to a hash of the payee list and the amounts, so changing one name or one cent voids it.",
];

const BUILT_WITH = [
  "PayPal Agent Toolkit",
  "PayPal Server SDK",
  "PayPal Invoicing",
  "PayPal Payouts",
  "Claude",
  "Bryntum Gantt",
  "AG Studio",
  "Next.js",
];

// ---------- small pieces ----------

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const BTN =
  "inline-flex h-11 items-center justify-center rounded-md px-5 text-[14px] font-medium whitespace-nowrap transition-colors select-none " +
  FOCUS;
const BTN_PRIMARY = `${BTN} bg-ink text-paper hover:bg-ink/85`;
const BTN_SECONDARY = `${BTN} border border-line bg-card text-ink hover:border-ink-3`;

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="num text-[12px] font-medium tracking-[0.08em] text-ink-3 uppercase">{children}</p>;
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display text-[34px] leading-[1.1] text-balance text-ink sm:text-[42px]">
      {children}
    </h2>
  );
}

function ArrowOut() {
  return (
    <svg viewBox="0 0 12 12" className="ml-1.5 size-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4.5 2.5h5v5M9.5 2.5 3 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoFrame() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-paper-2 shadow-[0_14px_40px_-18px_rgba(22,24,29,0.22)]">
      {DEMO_VIDEO_ID ? (
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}`}
          title="Tranche demo video"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <>
          <img
            src="/how/poster.webp"
            alt=""
            width={1400}
            height={788}
            className="absolute inset-0 size-full object-cover opacity-45 blur-[1.5px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/55 to-paper/25" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-ink/90 sm:size-16" aria-hidden>
              <svg viewBox="0 0 16 16" className="ml-0.5 size-5 text-paper sm:size-6" fill="currentColor">
                <path d="M4 2.6v10.8a.6.6 0 0 0 .92.5l8.5-5.4a.6.6 0 0 0 0-1L4.92 2.1A.6.6 0 0 0 4 2.6Z" />
              </svg>
            </span>
            <p className="display text-[26px] leading-none text-ink sm:text-[34px]">Demo video coming soon</p>
            <p className="text-[13px] text-ink-2 sm:text-[14px]">Under 3 minutes.</p>
          </div>
        </>
      )}
    </div>
  );
}

function StepRow({ step, n }: { step: Step; n: number }) {
  const flip = n % 2 === 0; // even steps put the picture on the left (desktop only)
  return (
    <li
      className={`grid items-center gap-5 lg:gap-12 ${
        flip ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      }`}
    >
      <div className={`lg:row-start-1 ${flip ? "lg:col-start-2" : "lg:col-start-1"}`}>
        <p className="num text-[13px] font-medium text-green">
          Step {n} of {STEPS.length}
        </p>
        <h3 className="display mt-2 text-[30px] leading-[1.12] text-balance text-ink sm:text-[36px]">{step.title}</h3>
        <p className="mt-3 text-[16px] leading-[1.6] text-pretty text-ink-2">{step.body}</p>
        <p className="mt-4 border-l-2 border-line pl-3 text-[13px] leading-[1.55] text-ink-3">{step.via}</p>
      </div>
      <div className={`min-w-0 lg:row-start-1 ${flip ? "lg:col-start-1" : "lg:col-start-2"}`}>
        <a
          href={step.img.src}
          target="_blank"
          rel="noopener noreferrer"
          title="Open full size"
          className={`block overflow-hidden rounded-xl border border-line bg-card shadow-[0_12px_32px_-14px_rgba(22,24,29,0.2)] ${FOCUS}`}
        >
          <img
            src={step.img.src}
            alt={step.img.alt}
            width={step.img.width}
            height={step.img.height}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
        </a>
      </div>
    </li>
  );
}

// ---------- page ----------

export default function HowItWorksPage() {
  return (
    <div className="flex-1 bg-paper text-ink">
      <main>
        {/* Hero */}
        <section className="mx-auto w-full max-w-[1160px] px-5 pt-14 pb-10 sm:px-8 sm:pt-24 sm:pb-14">
          <Kicker>How it works</Kicker>
          <h1 className="display mt-3 text-[76px] leading-[0.95] text-ink sm:text-[112px]">Tranche</h1>
          <p className="mt-5 max-w-[22ch] text-[22px] leading-[1.25] font-medium text-ink sm:max-w-none sm:text-[28px]">
            The delivery plan where money is a dependency.
          </p>
          <p className="mt-5 max-w-[60ch] text-[16px] leading-[1.65] text-pretty text-ink-2 sm:text-[17px]">
            Small studios plan the work in one tool and chase the money in another, so the plan keeps pretending the
            client has paid. In Tranche every phase ends in a PayPal payment gate, and the work after a gate stays
            locked until the client&rsquo;s money arrives. A Claude agent does the money work, and plain code makes sure
            it can never pay anyone on its own.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={DASHBOARD_URL} className={BTN_PRIMARY}>
              Open the live demo
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
              Code on GitHub
              <ArrowOut />
            </a>
          </div>
          <p className="mt-4 text-[13px] leading-[1.6] text-ink-2">
            The live demo asks for an access code once: <span className="num text-ink select-all">northwind-judge</span>. It
            only keeps bots from spending the demo&apos;s PayPal sandbox and Claude calls.
          </p>
        </section>

        {/* Video */}
        <section aria-label="Demo video" className="mx-auto w-full max-w-[1160px] px-5 pb-16 sm:px-8 sm:pb-24">
          <VideoFrame />
        </section>

        {/* Steps */}
        <section aria-labelledby="steps" className="border-t border-line">
          <div className="mx-auto w-full max-w-[1160px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="max-w-[60ch]">
              <Kicker>The demo</Kicker>
              <div className="mt-2">
                <SectionTitle id="steps">Five steps, one project</SectionTitle>
              </div>
              <p className="mt-4 text-[16px] leading-[1.6] text-ink-2">
                The demo project is a $12,000 brand site for a coffee company, run by a three-person studio. It has four
                payment gates: a $1,000 kickoff deposit and three milestone payments.
              </p>
              <p className="mt-2 text-[13px] text-ink-3">Tap or click a screenshot to open it full size.</p>
            </div>
            <ol className="mt-12 flex flex-col gap-14 sm:mt-16 sm:gap-20">
              {STEPS.map((s, i) => (
                <StepRow key={s.title} step={s} n={i + 1} />
              ))}
            </ol>
          </div>
        </section>

        {/* The eight checks */}
        <section aria-labelledby="checks" className="border-t border-line bg-paper-2/60">
          <div className="mx-auto grid w-full max-w-[1160px] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <Kicker>The guardrail</Kicker>
              <div className="mt-2">
                <SectionTitle id="checks">Why the agent cannot pay anyone</SectionTitle>
              </div>
              <p className="mt-4 text-[16px] leading-[1.6] text-ink-2">
                A payout goes out only when all eight checks pass. They are plain code with no model involved, and the
                agent has no tool that sends money.
              </p>
              <p className="mt-3 text-[14px] leading-[1.6] text-ink-3">
                Approved payouts are written to a hash-chained receipt log. Project notes reach the model wrapped as
                information, never as instructions.
              </p>
            </div>
            <ol className="overflow-hidden rounded-xl border border-line bg-card lg:col-span-7">
              {CHECKS.map((c, i) => (
                <li key={c} className="flex gap-4 border-t border-line px-4 py-3.5 first:border-t-0 sm:px-5">
                  <span className="num mt-[3px] w-5 shrink-0 text-[13px] leading-[1.55] text-ink-3">{i + 1}</span>
                  <span className="min-w-0 text-[15px] leading-[1.55] text-ink">{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Built with */}
        <section aria-labelledby="built" className="border-t border-line">
          <div className="mx-auto w-full max-w-[1160px] px-5 py-14 sm:px-8 sm:py-20">
            <Kicker>Stack</Kicker>
            <div className="mt-2">
              <SectionTitle id="built">Built with</SectionTitle>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2">
              {BUILT_WITH.map((t) => (
                <li
                  key={t}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-card px-3.5 text-[13.5px] text-ink"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:gap-6 sm:px-8">
          <span className="display text-[28px] leading-none text-ink">Tranche</span>
          <nav aria-label="Links" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <Link
              href={DASHBOARD_URL}
              className="text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink-3"
            >
              Open the live demo
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink-3"
            >
              Code on GitHub
            </a>
          </nav>
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-soft px-2.5 py-1 text-[12px] font-medium text-blue sm:ml-auto">
            <span className="size-1.5 rounded-full bg-blue" aria-hidden />
            PayPal sandbox only
          </p>
        </div>
      </footer>
    </div>
  );
}
