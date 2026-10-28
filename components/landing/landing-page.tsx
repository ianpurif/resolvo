"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquare,
  ShieldCheck,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThreadMotif } from "@/components/thread-motif";

const navigation = [
  ["The workspace", "#product"],
  ["Capabilities", "#capabilities"],
  ["How it works", "#how-it-works"],
];
const capabilities = [
  {
    number: "01",
    icon: Layers3,
    title: "A shared source of understanding.",
    text: "Documents, public web pages, and written knowledge, brought together in a company workspace. Less searching across places. More context in one.",
  },
  {
    number: "02",
    icon: MessageSquare,
    title: "Conversations that keep the thread.",
    text: "Ask a follow-up, explore a detail, or pick up where you left off. Your personal conversation history travels with you.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Answers you can trace back.",
    text: "Read the source excerpts behind a response. Your company’s evidence stays connected to the conversation, so you can check what matters.",
  },
];

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  return (
    <div className="landing">
      <div className="marketing-top">
        <header className="marketing-header">
          <Link href="/" aria-label="Resolvo home">
            <Brand />
          </Link>
          <nav aria-label="Main navigation">
            {navigation.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <Link href="/login" className="hidden text-xs font-medium sm:block">
              Sign in
            </Link>
            <Link href="/login" className="action-button">
              Get started <ArrowUpRight />
            </Link>
            <button
              type="button"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="mobile-navigation"
              className="rounded-md p-2 md:hidden"
            >
              {menu ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>
        {menu && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="mobile-marketing-nav md:hidden"
          >
            {[...navigation, ["Sign in", "/login"]].map(([label, href]) => (
              <Link key={href} href={href} onClick={() => setMenu(false)}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <main id="main-content">
        <div className="marketing-top">
          <section className="marketing-hero">
            <div className="hero-art" aria-hidden="true">
              <Image
                src="/art/knowledge-weave.webp"
                alt=""
                fill
                sizes="(max-width: 767px) 110vw, 80vw"
                preload
                className="object-cover"
              />
            </div>
            <div className="hero-copy hero-enter">
              <p className="eyebrow">
                Company knowledge, thoughtfully connected
              </p>
              <h1>
                Your knowledge.
                <br />A clearer <em>thread.</em>
              </h1>
              <p>
                Turn the information your company already has into answers your
                team can use. Connected sources. Considered responses. A little
                more clarity.
              </p>
              <div className="hero-actions">
                <Link href="/login" className="action-button">
                  Open your workspace <ArrowUpRight />
                </Link>
                <a href="#product" className="text-link">
                  Explore Resolvo <ArrowDown />
                </a>
              </div>
              <div className="hero-footnote">
                <LockKeyhole className="size-3" /> Private company sources.
                Personal conversations.
              </div>
            </div>
            <span className="hero-art-label" aria-hidden="true">
              Many sources. One connected understanding.
            </span>
          </section>
          <div className="knowledge-strip">
            <span>Bring what your team knows</span>
            <span>
              <FileText /> Documents & files
            </span>
            <span>
              <Globe2 /> Public web pages
            </span>
            <span>
              <BookOpen /> Written knowledge
            </span>
            <span>
              <MessageSquare /> Grounded conversations
            </span>
          </div>
        </div>
        <div>
          <section id="product" className="marketing-section">
            <div className="section-intro">
              <div>
                <p className="eyebrow">A workspace for understanding</p>
                <h2 className="section-title">
                  Less looking.
                  <br />
                  <em>More knowing.</em>
                </h2>
              </div>
              <p>
                The answer is often somewhere in your company’s knowledge.
                Resolvo connects the right pieces, so a simple question can
                become a useful conversation.
              </p>
            </div>
            <div className="product-story">
              <div className="product-story-aside">
                <div>
                  <p className="eyebrow mb-6">From information to insight</p>
                  <h3>
                    A place to follow
                    <br />
                    your curiosity.
                  </h3>
                  <p>
                    Ask in your own words. Read the context. Open the evidence.
                    Keep going from there.
                  </p>
                </div>
                <ThreadMotif />
              </div>
              <div
                className="product-preview"
                aria-label="Illustration of how a source-grounded conversation works"
              >
                <div className="preview-toolbar">
                  <span className="flex items-center gap-2">
                    <Brand compact className="[&_.brand-mark]:size-6" /> Resolvo
                    assistant
                  </span>
                  <span className="text-muted-foreground">A closer look</span>
                </div>
                <div className="preview-thread">
                  <div className="preview-question">
                    How does this process work?
                  </div>
                  <div className="preview-answer">
                    <Brand compact className="[&_.brand-mark]:size-7" />
                    <div>
                      <strong className="font-semibold">
                        An answer, with its context.
                      </strong>
                      <p>
                        Resolvo finds relevant passages in your connected
                        knowledge and uses them to build a response. Follow-up
                        questions keep the conversation moving.
                      </p>
                      <span className="preview-source">
                        <FileText /> Supporting source excerpts <ArrowUpRight />
                      </span>
                      <p className="preview-caption">
                        Illustrative conversation · Your answers use your
                        company’s sources.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="capabilities" className="capability-grid">
              {capabilities.map(({ number, icon: Icon, title, text }) => (
                <article className="capability" key={number}>
                  <div className="capability-top">
                    <span>{number} /</span>
                    <Icon />
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="source-section">
            <div className="marketing-section source-layout">
              <div>
                <p className="eyebrow">Different formats. Shared context.</p>
                <h2 className="section-title">
                  Everything you know.
                  <br />
                  <em>Woven together.</em>
                </h2>
                <p>
                  Give your company’s knowledge a connected home. Add what you
                  need, update it as it changes, and let your team ask better
                  questions.
                </p>
                <Link href="/login" className="text-link">
                  Connect your first source <ArrowUpRight />
                </Link>
              </div>
              <div className="source-ledger">
                {[
                  {
                    icon: FileText,
                    title: "The documents you rely on",
                    text: "PDF, DOCX, text, Markdown & structured files",
                    number: "01",
                  },
                  {
                    icon: Globe2,
                    title: "The pages worth keeping",
                    text: "Visible content from public web pages",
                    number: "02",
                  },
                  {
                    icon: BookOpen,
                    title: "The knowledge in your team",
                    text: "Write, edit & index knowledge directly",
                    number: "03",
                  },
                ].map(({ icon: Icon, title, text, number }) => (
                  <div key={number} className="source-ledger-row">
                    <Icon />
                    <div>
                      <strong>{title}</strong>
                      <span>{text}</span>
                    </div>
                    <span className="source-index">{number}</span>
                  </div>
                ))}
                <p className="flex items-center gap-2 text-[11px]!">
                  <LockKeyhole className="size-3.5 shrink-0" /> Sources are
                  shared only within your company.
                </p>
              </div>
            </div>
          </section>
          <section id="how-it-works" className="marketing-section">
            <div className="section-intro">
              <div>
                <p className="eyebrow">A simple beginning</p>
                <h2 className="section-title">
                  Make room for
                  <br />
                  <em>a better answer.</em>
                </h2>
              </div>
              <p>
                From the first source to the next question, a straightforward
                path to working with what you know.
              </p>
            </div>
            <div className="process-list">
              {[
                [
                  "01",
                  "Create your space",
                  "Sign in with Google and create a private workspace for your company. Your conversations stay personal to you.",
                ],
                [
                  "02",
                  "Bring your knowledge",
                  "Upload a file, connect a public web page, or write a source. Resolvo indexes the content for your company’s assistant.",
                ],
                [
                  "03",
                  "Start pulling the thread",
                  "Ask a question, read the source excerpts, and follow up. Come back to your saved conversations whenever you need them.",
                ],
              ].map(([number, title, text]) => (
                <div className="process-row" key={number}>
                  <span>{number}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="marketing-close">
            <ThreadMotif />
            <h2 className="section-title">
              Your next answer
              <br />
              is already <em>taking shape.</em>
            </h2>
            <Link href="/login" className="action-button">
              Get started with Resolvo <ArrowRight />
            </Link>
            <p>Google sign-in. A private workspace for your company.</p>
          </section>
        </div>
      </main>
      <footer className="marketing-footer">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <p>Company knowledge, thoughtfully connected.</p>
        <Link href="/login" className="text-link">
          Sign in to Resolvo <ArrowUpRight />
        </Link>
      </footer>
    </div>
  );
}
