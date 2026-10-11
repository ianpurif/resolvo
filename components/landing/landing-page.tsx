"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  BookOpen,
  Check,
  FileText,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";

const landscape =
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=85";
const capabilities = [
  {
    number: "01",
    icon: Layers3,
    title: "Bring your knowledge together.",
    text: "Connect documents, public web pages, and written knowledge. One searchable home for the information your team depends on.",
  },
  {
    number: "02",
    icon: MessageSquare,
    title: "Ask naturally. Get context.",
    text: "Turn a question into a conversation. Resolvo searches your company’s sources and keeps the thread as you go.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Know where an answer comes from.",
    text: "Open the original source excerpts behind an answer. When the evidence is missing, your assistant tells you.",
  },
];

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="landing overflow-x-clip bg-[#f8faf9]">
      <header className="mx-auto flex h-24 max-w-[1280px] items-center justify-between gap-5 px-6 lg:px-10">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <nav
          className="hidden items-center gap-9 text-[13px] text-[#54645e] md:flex"
          aria-label="Main navigation"
        >
          <a href="#product" className="hover:text-primary">
            The workspace
          </a>
          <a href="#capabilities" className="hover:text-primary">
            Capabilities
          </a>
          <a href="#how-it-works" className="hover:text-primary">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="hidden text-[13px] font-medium sm:block"
          >
            Sign in
          </Link>
          <Link href="/login" className="landing-button px-5 py-3 text-xs">
            Get started
            <ArrowUpRight className="size-3.5" />
          </Link>
          <button
            onClick={() => setMenu(!menu)}
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            className="md:hidden"
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>
      {menu && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="mx-6 mb-5 flex flex-col gap-5 rounded-2xl border bg-white p-5 text-sm md:hidden"
        >
          {[
            ["The workspace", "#product"],
            ["Capabilities", "#capabilities"],
            ["How it works", "#how-it-works"],
            ["Sign in", "/login"],
          ].map(([label, href]) => (
            <Link key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </Link>
          ))}
        </nav>
      )}
      <main id="main-content">
        <section className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-6 pt-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:px-10 lg:pt-20 lg:pb-24">
          <div className="hero-enter relative z-10">
            <p className="eyebrow mb-7 flex items-center gap-2.5">
              <span className="size-1.5 rounded-full bg-primary" />
              YOUR KNOWLEDGE. CONNECTED.
            </p>
            <h1 className="max-w-[680px] text-[clamp(44px,6.5vw,82px)] leading-[1.06] font-medium tracking-[-0.065em]">
              Great answers.
              <br />
              Already in
              <br />
              <span className="text-primary">your knowledge.</span>
            </h1>
            <p className="mt-7 max-w-[430px] text-[15px] leading-7 text-[#63736c]">
              Bring your company’s documents and data into a conversation. Get
              clear, source-grounded answers that move work forward.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <Link href="/login" className="landing-button px-6 py-4 text-sm">
                Open your workspace
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#product"
                className="flex items-center gap-2 text-[13px] font-medium"
              >
                Explore Resolvo
                <ArrowDownRight />
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[11px] text-[#75827c]">
              <LockKeyhole className="size-3" />
              Private company sources. Personal conversations.
            </p>
          </div>
          <div
            className="knowledge-visual hero-enter relative isolate min-h-[420px] overflow-hidden rounded-[28px] bg-[#0a332e] sm:min-h-[510px]"
            role="img"
            aria-label="Documents, websites, and written knowledge connect to Resolvo for source-grounded answers."
          >
            <Image
              src={landscape}
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 600px"
              preload
              className="object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-linear-to-b from-[#062f2a]/70 via-[#062f2a]/30 to-[#062f2a]/95" />
            <div className="absolute top-7 right-7 left-7 flex justify-between text-[10px] tracking-[.18em] text-white/65">
              <span>THE CONNECTED WORKSPACE</span>
              <Sparkles className="size-4 text-[#b5e0cc]" />
            </div>
            <svg
              className="absolute inset-0 size-full text-[#b3d8c7]"
              viewBox="0 0 520 510"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="orbit-glow">
                  <stop stopColor="#9ce8c4" stopOpacity=".25" />
                  <stop offset="1" stopColor="#9ce8c4" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="260" cy="245" r="195" fill="url(#orbit-glow)" />
              <g
                className="orbit-lines"
                style={{ transformOrigin: "260px 245px" }}
              >
                <ellipse
                  cx="260"
                  cy="245"
                  rx="190"
                  ry="80"
                  stroke="currentColor"
                  strokeOpacity=".25"
                  transform="rotate(-30 260 245)"
                />
                <ellipse
                  cx="260"
                  cy="245"
                  rx="190"
                  ry="80"
                  stroke="currentColor"
                  strokeOpacity=".25"
                  transform="rotate(30 260 245)"
                />
                <ellipse
                  cx="260"
                  cy="245"
                  rx="190"
                  ry="80"
                  stroke="currentColor"
                  strokeOpacity=".25"
                  transform="rotate(90 260 245)"
                />
              </g>
              <path
                d="M110 150L260 245L422 164M260 245L163 345"
                stroke="#cdf6df"
                strokeOpacity=".25"
                strokeDasharray="4 6"
              />
              <circle cx="95" cy="260" r="3" fill="#bdf1d7" />
              <circle cx="410" cy="282" r="3" fill="#bdf1d7" />
            </svg>
            <div className="absolute top-[40%] left-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[26px] border border-white/20 bg-[#edf9f0] shadow-[0_0_70px_#a3e3c533]">
              <Brand compact className="[&_.brand-mark]:size-17" />
            </div>
            <div className="visual-chip top-[24%] left-[6%]">
              <FileText className="size-4 text-[#a8e0c9]" />
              <span>Documents</span>
            </div>
            <div className="visual-chip top-[31%] right-[5%]">
              <Globe2 className="size-4 text-[#a8e0c9]" />
              <span>Web pages</span>
            </div>
            <div className="visual-chip top-[61%] left-[18%]">
              <BookOpen className="size-4 text-[#a8e0c9]" />
              <span>Team knowledge</span>
            </div>
            <div className="absolute right-7 bottom-8 left-7 border-t border-white/15 pt-6">
              <p className="text-[24px] font-medium tracking-[-.04em] text-white">
                From scattered sources
                <br />
                to a shared understanding.
              </p>
              <p className="mt-3 flex items-center gap-2 text-[10px] tracking-wider text-[#aed2c1]">
                <span className="size-1 rounded-full bg-[#b8e9cf]" />
                CONTEXT IN. CLARITY OUT.
              </p>
            </div>
          </div>
        </section>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-5 border-y px-6 py-7 text-xs text-[#6a7b72]">
          <span className="font-medium text-foreground">
            Built around the knowledge you already have.
          </span>
          {[
            ["PDF & DOCX", FileText],
            ["Public web pages", Globe2],
            ["Written knowledge", BookOpen],
            ["Source citations", ShieldCheck],
          ].map(([label, Icon]) => {
            const Symbol = Icon as typeof FileText;
            return (
              <span key={String(label)} className="flex items-center gap-2">
                <Symbol className="size-4 text-primary" />
                {String(label)}
              </span>
            );
          })}
        </div>
        <section
          id="product"
          className="mx-auto max-w-[1200px] scroll-mt-10 px-6 py-22 lg:py-28"
        >
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="eyebrow mb-4">A LITTLE LESS SEARCHING</p>
              <h2 className="section-title">
                Meet your company’s
                <br />
                new conversation space.
              </h2>
            </div>
            <p className="max-w-[340px] text-sm leading-7 text-muted-foreground">
              One calm workspace to ask a question, follow the evidence, and
              pick up where you left off.
            </p>
          </div>
          <div
            className="product-window mt-12 grid overflow-hidden rounded-2xl border bg-white shadow-[0_25px_80px_-35px_#143f3033] md:grid-cols-[210px_1fr]"
            aria-label="Preview of the Resolvo chat workspace"
          >
            <aside className="hidden flex-col border-r bg-[#f2f6f3] p-5 md:flex">
              <Brand className="scale-90 origin-left" />
              <Link
                href="/login"
                className="mt-8 flex items-center gap-2 rounded-lg border bg-white p-3 text-xs"
              >
                <Plus className="size-3.5" />
                New chat
              </Link>
              <p className="mt-8 text-[10px] text-muted-foreground">
                YOUR CONVERSATIONS
              </p>
              <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
                Your history, right where
                <br />
                you need it.
              </p>
              <div className="mt-auto space-y-4 pt-20 text-xs text-[#697c71]">
                <span className="flex gap-2">
                  <BookOpen className="size-3.5" />
                  Knowledge
                </span>
                <span className="flex gap-2">
                  <Layers3 className="size-3.5" />
                  Workspace
                </span>
              </div>
            </aside>
            <div className="flex min-h-[450px] flex-col">
              <div className="flex items-center justify-between border-b px-6 py-5">
                <span className="text-xs font-medium">Resolvo assistant</span>
                <span className="flex gap-1.5 text-[10px] text-muted-foreground">
                  <LockKeyhole className="size-3" />
                  Private workspace
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                <Brand compact className="mb-5 [&_.brand-mark]:size-12" />
                <h3 className="text-[27px] font-medium tracking-[-.05em]">
                  What would you like to know?
                </h3>
                <p className="mt-3 text-xs text-muted-foreground">
                  Start with a question. Find clarity in your sources.
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                  {[
                    "Understand a policy",
                    "Find a process",
                    "Explore your documents",
                  ].map((label) => (
                    <Link
                      key={label}
                      href="/login"
                      className="rounded-full border px-4 py-2 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <Link
                href="/login"
                aria-label="Try the Resolvo assistant"
                className="mx-auto mb-6 flex w-[88%] items-center justify-between rounded-2xl border p-4 text-xs text-muted-foreground shadow-xs"
              >
                <span>Ask your company’s knowledge…</span>
                <span className="rounded-lg bg-primary p-2 text-white">
                  <ArrowUp className="size-4" />
                </span>
              </Link>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4 text-[10px] text-muted-foreground">
            <span>
              PRODUCT PREVIEW · YOUR WORKSPACE STARTS WITH YOUR OWN SOURCES
            </span>
            <Link
              href="/login"
              className="flex shrink-0 items-center gap-1 text-primary"
            >
              Make it yours
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </section>
        <section id="capabilities" className="border-y bg-[#eef3ef]">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-20 lg:grid-cols-[.85fr_1fr] lg:gap-24 lg:py-24">
            <div>
              <p className="eyebrow mb-5">KNOWLEDGE THAT WORKS WITH YOU</p>
              <h2 className="section-title">
                Everything you know.
                <br />
                <span className="text-primary">More useful together.</span>
              </h2>
              <p className="mt-6 max-w-sm text-sm leading-7 text-muted-foreground">
                For the team finding an answer. For the customer needing
                support. For the work waiting on the right information.
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary"
              >
                Start a better conversation
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
            <div>
              {capabilities.map(({ number, icon: Icon, title, text }) => (
                <article
                  key={number}
                  className="flex gap-5 border-b border-[#d8e2db] py-7 first:pt-0 last:border-0 last:pb-0"
                >
                  <span className="mt-1 text-[10px] text-[#8b9b91]">
                    {number}
                  </span>
                  <div>
                    <Icon className="mb-4 size-5 text-primary" />
                    <h3 className="text-lg font-medium tracking-[-.025em]">
                      {title}
                    </h3>
                    <p className="mt-3 text-[13px] leading-7 text-muted-foreground">
                      {text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="mx-auto max-w-[1200px] px-6 py-22 lg:py-28"
        >
          <p className="eyebrow mb-4">FROM SOURCE TO ANSWER</p>
          <h2 className="section-title">Less setup. More understanding.</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              [
                "01",
                "Create your space",
                "Sign in with Google and create your company’s private workspace.",
              ],
              [
                "02",
                "Connect your sources",
                "Upload a document, import a public page, or add knowledge. Resolvo indexes the content.",
              ],
              [
                "03",
                "Let the conversation flow",
                "Ask, explore source excerpts, and return to your saved conversations anytime.",
              ],
            ].map(([number, title, text]) => (
              <div key={number} className="relative border-t pt-6">
                <span className="text-xs text-primary">{number}</span>
                <h3 className="mt-5 text-lg font-medium tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 max-w-[300px] text-[13px] leading-7 text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-4 mb-5 overflow-hidden rounded-[28px] bg-[#103d32] text-white sm:mx-6">
          <div className="relative mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 overflow-hidden px-6 py-16 md:flex-row md:items-center lg:py-20">
            <svg
              className="pointer-events-none absolute -top-50 -right-50 size-[650px] text-[#87b19a]/15"
              viewBox="0 0 600 600"
              fill="none"
              aria-hidden="true"
            >
              {[100, 140, 180, 220, 260, 300].map((r) => (
                <circle key={r} cx="300" cy="300" r={r} stroke="currentColor" />
              ))}
            </svg>
            <div className="relative">
              <p className="eyebrow mb-5 text-[#a8d3bb]!">
                THE ANSWER IS CLOSER THAN YOU THINK
              </p>
              <h2 className="section-title">
                Put your knowledge
                <br />
                into motion.
              </h2>
              <p className="mt-5 text-sm text-[#bdd1c4]">
                Your next great conversation starts here.
              </p>
            </div>
            <div className="relative">
              <Link
                href="/login"
                className="flex items-center gap-5 rounded-xl bg-[#d8f0de] px-6 py-4 text-sm font-semibold text-[#153a2c] transition-colors hover:bg-white"
              >
                Get started with Resolvo
                <ArrowUpRight className="size-4" />
              </Link>
              <p className="mt-4 flex items-center gap-2 text-[11px] text-[#bdd1c4]">
                <Check className="size-3.5" />
                Google sign-in. Your own private workspace.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-6 px-6 py-9 lg:px-10">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <p className="text-[11px] text-muted-foreground">
          Company knowledge, thoughtfully connected.
        </p>
        <a
          href="https://unsplash.com/license"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-primary"
        >
          Landscape imagery · Unsplash
        </a>
      </footer>
    </div>
  );
}

function ArrowDownRight() {
  return <ArrowUpRight className="size-3.5 rotate-90" />;
}
