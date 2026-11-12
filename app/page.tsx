/* eslint-disable @next/next/no-img-element -- plain <img>: these are small static crops, and skipping the image optimizer keeps hosting usage at zero. */

import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DASHBOARD_URL, DEMO_VIDEO_ID, GITHUB_URL } from "@/lib/site";
import RevealOnScroll from "@/components/landing/RevealOnScroll";
import { ArrowOut, ArrowRight, Check, GitHubMark, Lock, Play } from "@/components/landing/icons";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "Tranche: the delivery plan where money is a dependency",
  description:
    "Every phase of a client project ends in a PayPal payment gate. A Claude agent raises invoices, chases late payments and replans the work, and it can never pay anyone on its own. Try the live demo.",
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

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "#built-with", label: "Built with" },
];

// ---------- small pieces ----------

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const LIFT =
  "transition-[translate,box-shadow,background-color,border-color,color] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** The one action that matters. Large, solid, with an arrow that nudges on hover. */
const CTA_BIG =
  `group inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-7 text-[16px] font-medium whitespace-nowrap select-none ${LIFT} ${FOCUS} ` +
  "bg-ink text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_-10px_rgba(22,24,29,0.6)] hover:bg-[#262932] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_30px_-12px_rgba(22,24,29,0.6)]";
const BTN_GHOST_BIG =
  `inline-flex h-14 items-center justify-center gap-2.5 rounded-full border border-line bg-card/80 px-6 text-[15px] font-medium whitespace-nowrap text-ink select-none ${LIFT} ${FOCUS} ` +
  "hover:border-ink-3 hover:shadow-[0_10px_24px_-14px_rgba(22,24,29,0.35)]";

function d(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

function Kicker({ children, className = "text-ink-3" }: { children: ReactNode; className?: string }) {
  return <p className={`num text-[12px] font-medium tracking-[0.08em] uppercase ${className}`}>{children}</p>;
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="display text-[34px] leading-[1.1] text-balance text-ink sm:text-[44px]">
      {children}
    </h2>
  );
}

function CtaArrow() {
  return (
    <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
  );
}

// ---------- top bar ----------

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1160px] items-center gap-2 px-4 sm:h-16 sm:px-8">
        <a href="#top" className={`display shrink-0 rounded-sm text-[26px] leading-none text-ink sm:text-[28px] ${FOCUS}`}>
          Tranche
        </a>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-0.5 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`rounded-full px-3 py-1.5 text-[14px] text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink ${FOCUS}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Tranche on GitHub"
            className={`inline-flex h-9 items-center gap-2 rounded-full px-2.5 text-[14px] text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink sm:px-3 ${FOCUS}`}
          >
            <GitHubMark className="size-[18px] sm:size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link
            href={DASHBOARD_URL}
            className={`group inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium whitespace-nowrap text-paper shadow-[0_6px_16px_-8px_rgba(22,24,29,0.6)] select-none hover:bg-[#262932] sm:h-10 sm:px-5 ${LIFT} ${FOCUS}`}
          >
            <span className="sm:hidden">Try it</span>
            <span className="hidden sm:inline">Try the live demo</span>
            <CtaArrow />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------- hero ----------

function ProductShot() {
  return (
    <figure className="lp-rise" style={d(260)}>
      <div className="relative">
        {/* soft colour wash behind the frame */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -top-10 -bottom-6 rounded-[48px] bg-[radial-gradient(60%_60%_at_30%_40%,rgba(11,110,79,0.13),transparent_70%),radial-gradient(50%_55%_at_80%_60%,rgba(59,91,219,0.10),transparent_70%)] blur-2xl sm:-inset-x-12"
        />
        <div className="relative overflow-hidden rounded-xl border border-line bg-card shadow-[0_40px_80px_-36px_rgba(22,24,29,0.4),0_14px_28px_-16px_rgba(22,24,29,0.16)] sm:rounded-2xl">
          {/* browser chrome */}
          <div className="flex items-center gap-3 border-b border-line bg-paper-2/80 px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex shrink-0 gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[#e3ded3]" />
              <span className="size-2.5 rounded-full bg-[#e3ded3]" />
              <span className="size-2.5 rounded-full bg-[#e3ded3]" />
            </div>
            <div className="mx-auto flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-[11px] text-ink-3 sm:h-7 sm:px-3 sm:text-[12px]">
              <Lock className="size-2.5 shrink-0" />
              <span className="num truncate">tranche-kohl.vercel.app/dashboard</span>
            </div>
            <div className="hidden w-[42px] shrink-0 sm:block" aria-hidden />
          </div>
          <Link href={DASHBOARD_URL} className={`group relative block ${FOCUS}`}>
            <picture>
              <source media="(max-width: 639px)" srcSet="/how/dashboard-phone.webp" width={1440} height={1066} />
              <img
                src="/how/dashboard.webp"
                width={2160}
                height={1350}
                fetchPriority="high"
                decoding="async"
                alt="The Tranche dashboard at the end of the demo project: $12,000 collected across 4 payment gates, $6,700 paid to the crew in 3 payouts, the plan 5 days behind after a late payment, and the agent's activity log, where a person approved a $2,900 crew payout after all 8 mandate checks passed."
                className="block h-auto w-full"
              />
            </picture>
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-[opacity,background-color] duration-200 group-hover:bg-ink/10 group-hover:opacity-100"
            >
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-paper shadow-lg">
                Open the live demo
                <ArrowRight className="size-4" />
              </span>
            </span>
          </Link>
        </div>
      </div>
      <figcaption className="mx-auto mt-5 max-w-[68ch] px-2 text-center text-[13px] leading-[1.6] text-pretty text-ink-3 sm:text-[13.5px]">
        The demo project at the finish: all four payment gates paid, one of them late, the plan moved five days, and
        $6,700 paid to the crew after a person approved each payout.
      </figcaption>
    </figure>
  );
}

function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="lp-grid-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-[1160px] px-5 pt-10 sm:px-8 sm:pt-16 lg:pt-14">
        <p
          className="lp-rise inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-card/80 px-3 py-1 text-[12.5px] leading-[1.4] text-ink-2"
          style={d(0)}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-green" aria-hidden />
          <span>
            PayPal AI Hackathon entry<span className="hidden sm:inline"> · runs on the PayPal sandbox</span>
          </span>
        </p>
        <h1
          id="hero-title"
          className="lp-rise display mt-5 max-w-[12.5em] text-[44px] leading-[1.02] text-balance text-ink min-[400px]:text-[48px] sm:mt-6 sm:text-[72px] sm:leading-[0.98] lg:text-[86px]"
          style={d(60)}
        >
          The delivery plan where <span className="text-green">money</span> is a dependency.
        </h1>
        <p
          className="lp-rise mt-5 max-w-[56ch] text-[17px] leading-[1.6] text-pretty text-ink-2 sm:mt-7 sm:text-[19px]"
          style={d(120)}
        >
          Every phase of a client project ends in a PayPal payment gate, and the work after it waits for the money. A
          Claude agent does the money work, and it can never pay anyone on its own.
        </p>
        <div className="lp-rise mt-7 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center" style={d(180)}>
          <Link href={DASHBOARD_URL} className={CTA_BIG}>
            Try the live demo
            <CtaArrow />
          </Link>
          <a href="#video" className={BTN_GHOST_BIG}>
            <span className="flex size-6 items-center justify-center rounded-full bg-ink/90 text-paper" aria-hidden>
              <Play className="ml-px size-2.5" />
            </span>
            Watch the 2-minute video
          </a>
        </div>
        <p className="lp-rise mt-4 text-[13.5px] text-ink-3" style={d(220)}>
          No sign-up. Real PayPal sandbox and Claude calls.
        </p>
      </div>
      <div className="relative mx-auto mt-12 w-full max-w-[1240px] px-3 pb-6 sm:mt-12 sm:px-8">
        <ProductShot />
      </div>
    </section>
  );
}

// ---------- what it does ----------

function GateVisual() {
  return (
    <div className="flex h-full flex-col justify-center gap-3" aria-hidden>
      <div className="flex items-center gap-2">
        <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-green/25 bg-green-soft px-2.5 text-[12px] font-medium text-green">
          <span className="truncate">Discovery</span>
        </div>
        <span className="size-3 shrink-0 rotate-45 rounded-[2px] bg-amber" />
        <div className="lp-hatch flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-ink-3">
          <Lock className="size-3 shrink-0" />
          <span className="truncate">Design</span>
        </div>
      </div>
      <p className="num text-[11.5px] text-amber">◆ $2,400 · waiting for the client</p>
    </div>
  );
}

function AgentVisual() {
  const tools = ["raise_invoice", "send_payment_reminder", "reschedule_after_late_payment"];
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5" aria-hidden>
      {tools.map((t) => (
        <li
          key={t}
          className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-card px-2.5 text-[11.5px]"
        >
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-green-soft text-green">
            <Check className="size-2.5" />
          </span>
          <span className="num truncate text-ink">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function ApprovalVisual() {
  return (
    <div className="flex h-full flex-col justify-center" aria-hidden>
      <div className="rounded-lg border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-ink">Pay $1,600 to 2 people</span>
          <span className="shrink-0 rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-medium text-amber">
            Proposed
          </span>
        </div>
        <p className="num mt-1.5 flex items-center gap-1.5 text-[11px] text-green">
          <Check className="size-2.5" /> 8 of 8 mandate checks pass
        </p>
        <div className="mt-2.5 flex gap-1.5">
          <span className="rounded-md bg-ink px-2.5 py-1 text-[11px] font-medium text-paper">Approve</span>
          <span className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-2">Reject</span>
        </div>
      </div>
    </div>
  );
}

const VALUES: { title: string; body: string; visual: ReactNode }[] = [
  {
    title: "Payment gates on the plan",
    body: "Every phase ends in a PayPal payment gate. Work after it waits for the money, so the plan never pretends the client has paid.",
    visual: <GateVisual />,
  },
  {
    title: "An agent does the money work",
    body: "A Claude agent asks for the deposit hold, raises the invoices, sends reminders, and replans the work when a client pays late.",
    visual: <AgentVisual />,
  },
  {
    title: "Only a person can pay the crew",
    body: "The agent can only propose crew pay. A person approves it, and plain code checks it against a signed mandate. Only then does PayPal send the money.",
    visual: <ApprovalVisual />,
  },
];

function WhatItDoes() {
  return (
    <section id="what" aria-labelledby="what-title">
      <div className="mx-auto w-full max-w-[1160px] px-5 pt-14 pb-16 sm:px-8 sm:pt-20 sm:pb-24">
        <div className="max-w-[62ch]" data-reveal>
          <Kicker>What it does</Kicker>
          <div className="mt-2">
            <SectionTitle id="what-title">Plan the work and the money in one place</SectionTitle>
          </div>
          <p className="mt-4 text-[16px] leading-[1.6] text-pretty text-ink-2 sm:text-[17px]">
            Small studios plan the work in one tool and chase the money in another, so the plan keeps pretending the
            client has paid. In Tranche the money is part of the plan.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3 lg:gap-5">
          {VALUES.map((v, i) => (
            <li key={v.title} data-reveal style={d(i * 90)}>
              <div
                className={`flex h-full flex-col rounded-2xl border border-line bg-card p-5 shadow-[0_1px_0_rgba(22,24,29,0.03)] hover:shadow-[0_18px_40px_-22px_rgba(22,24,29,0.3)] sm:p-6 md:max-lg:grid md:max-lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:max-lg:items-center md:max-lg:gap-8 ${LIFT}`}
              >
                <div className="h-[132px] rounded-xl border border-line/70 bg-paper px-4">{v.visual}</div>
                <div className="mt-6 md:max-lg:mt-0">
                  <p className="num text-[12px] font-medium text-green">0{i + 1}</p>
                  <h3 className="display mt-1.5 text-[27px] leading-[1.12] text-ink">{v.title}</h3>
                  <p className="mt-2.5 text-[15.5px] leading-[1.6] text-pretty text-ink-2">{v.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- video ----------

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
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover opacity-45 blur-[1.5px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/55 to-paper/25" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-ink/90 sm:size-16" aria-hidden>
              <Play className="ml-0.5 size-5 text-paper sm:size-6" />
            </span>
            <p className="display text-[26px] leading-none text-ink sm:text-[34px]">Demo video coming soon</p>
            <p className="text-[13px] text-ink-2 sm:text-[14px]">About 2 minutes.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Video() {
  return (
    <section id="video" aria-labelledby="video-title" className="border-t border-line bg-paper-2/40">
      <div className="mx-auto w-full max-w-[1160px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <Kicker>The video</Kicker>
            <div className="mt-2">
              <SectionTitle id="video-title">Watch a whole project run</SectionTitle>
            </div>
          </div>
          <Link
            href={DASHBOARD_URL}
            className={`group inline-flex w-fit items-center gap-1.5 rounded-sm text-[15px] font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink-3 ${FOCUS}`}
          >
            Or try it yourself
            <CtaArrow />
          </Link>
        </div>
        <div className="mt-8 sm:mt-10" data-reveal>
          <VideoFrame />
        </div>
      </div>
    </section>
  );
}

// ---------- steps ----------

function StepRow({ step, n }: { step: Step; n: number }) {
  const flip = n % 2 === 0; // even steps put the picture on the left (desktop only)
  return (
    <li
      data-reveal
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
          className={`block overflow-hidden rounded-xl border border-line bg-card shadow-[0_12px_32px_-14px_rgba(22,24,29,0.2)] hover:shadow-[0_22px_44px_-18px_rgba(22,24,29,0.3)] ${LIFT} ${FOCUS}`}
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

function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-t border-line">
      <div className="mx-auto w-full max-w-[1160px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-[60ch]" data-reveal>
          <Kicker>How it works</Kicker>
          <div className="mt-2">
            <SectionTitle id="how-title">Five steps, one project</SectionTitle>
          </div>
          <p className="mt-4 text-[16px] leading-[1.6] text-pretty text-ink-2">
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
  );
}

// ---------- safety ----------

function Safety() {
  return (
    <section id="safety" aria-labelledby="safety-title" className="border-t border-line bg-paper-2/60">
      <div className="mx-auto grid w-full max-w-[1160px] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5" data-reveal>
          <Kicker>The guardrail</Kicker>
          <div className="mt-2">
            <SectionTitle id="safety-title">Why the agent cannot pay anyone</SectionTitle>
          </div>
          <p className="mt-4 text-[16px] leading-[1.6] text-pretty text-ink-2">
            A payout goes out only when all eight checks pass. They are plain code with no model involved, and the agent
            has no tool that sends money.
          </p>
          <p className="mt-3 text-[14px] leading-[1.6] text-pretty text-ink-3">
            Approved payouts are written to a hash-chained receipt log. Project notes reach the model wrapped as
            information, never as instructions.
          </p>
        </div>
        <ol className="overflow-hidden rounded-xl border border-line bg-card lg:col-span-7" data-reveal style={d(80)}>
          {CHECKS.map((c, i) => (
            <li key={c} className="flex gap-4 border-t border-line px-4 py-3.5 first:border-t-0 sm:px-5">
              <span className="num mt-[3px] w-5 shrink-0 text-[13px] leading-[1.55] text-ink-3">{i + 1}</span>
              <span className="min-w-0 text-[15px] leading-[1.55] text-ink">{c}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------- built with ----------

function BuiltWith() {
  return (
    <section id="built-with" aria-labelledby="built-title" className="border-t border-line">
      <div className="mx-auto w-full max-w-[1160px] px-5 py-14 sm:px-8 sm:py-20" data-reveal>
        <Kicker>Stack</Kicker>
        <div className="mt-2">
          <SectionTitle id="built-title">Built with</SectionTitle>
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {BUILT_WITH.map((t) => (
            <li
              key={t}
              className={`inline-flex h-9 items-center rounded-full border border-line bg-card px-3.5 text-[13.5px] text-ink hover:border-ink-3 ${LIFT}`}
            >
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- closing call to action ----------

function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-[1160px] px-4 pb-14 sm:px-8 sm:pb-20">
      <div
        className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-14 text-paper sm:px-14 sm:py-20"
        data-reveal
      >
        <div aria-hidden className="lp-grid-bg-dark pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(11,110,79,0.55),transparent)] blur-2xl"
        />
        <div className="relative">
          <Kicker className="text-paper/55">Try it</Kicker>
          <h2 id="cta-title" className="display mt-3 max-w-[15em] text-[40px] leading-[1.04] text-balance sm:text-[60px]">
            See it run against the real PayPal sandbox.
          </h2>
          <p className="mt-5 max-w-[54ch] text-[16px] leading-[1.6] text-pretty text-paper/70 sm:text-[17px]">
            Each visitor gets their own project. Move the demo clock, pay the invoices as the client, approve a crew
            payout, then try to forge one.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={DASHBOARD_URL}
              className={`group inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-paper px-7 text-[16px] font-medium whitespace-nowrap text-ink shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] select-none hover:bg-white ${LIFT} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper`}
            >
              Try the live demo
              <CtaArrow />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-14 items-center justify-center gap-2 rounded-full border border-paper/20 px-6 text-[15px] font-medium whitespace-nowrap text-paper select-none hover:border-paper/45 hover:bg-paper/5 ${LIFT} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper`}
            >
              <GitHubMark className="size-4" />
              Open the code on GitHub
              <ArrowOut />
            </a>
          </div>
          <p className="mt-5 text-[13px] leading-[1.6] text-paper/55">
            No sign-up. If it ever asks for an access code, it is{" "}
            <span className="num text-paper/90 select-all">northwind-judge</span>.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------- page ----------

export default function LandingPage() {
  return (
    <div className="lp-root flex-1 overflow-x-clip bg-paper text-ink">
      <RevealOnScroll />
      <TopBar />
      <main>
        <Hero />
        <WhatItDoes />
        <Video />
        <Steps />
        <Safety />
        <BuiltWith />
        <ClosingCta />
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
              Try the live demo
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
