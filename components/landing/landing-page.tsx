"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, FileText, Globe2, Menu, Pause, Play, Plus, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { CinematicStage } from "./cinematic/cinematic-stage";
import { CHAPTERS, SOURCES, clamp, scrollProgress, type SourceKind } from "./cinematic/journey";
import type { SceneInput } from "./cinematic/scene";
import "./cinematic.css";

const navigation = [["The workspace", "#product"], ["Capabilities", "#capabilities"], ["How it works", "#how-it-works"]];
const sourceIcons = [FileText, Globe2, Plus];
function subscribeMotion(callback: () => void) {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotion = () => true;

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [paused, setPaused] = useState(false);
  const [allowMotion, setAllowMotion] = useState(false);
  const [selected, setSelected] = useState<SourceKind>(0);
  const [chapter, setChapter] = useState(0);
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, serverMotion);
  const reduced = reducedMotion && !allowMotion;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<SceneInput>({ progress: 0, paused: false, selected: 0 });
  const ready = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("fallback"), []);
  const selectSource = useCallback((kind: SourceKind) => {
    input.current.selected = kind;
    setSelected(kind);
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const sections = CHAPTERS.map(({ id }) => document.getElementById(id)!);
    let anchors: number[] = [], pending = 0;
    const update = () => {
      pending = 0;
      const progress = scrollProgress(window.scrollY, anchors);
      input.current.progress = progress;
      element.style.setProperty("--journey-progress", String(progress));
      setChapter(Math.min(4, Math.round(progress * 4)));
      sections.forEach((section, i) => {
        const distance = Math.abs(progress * 4 - i);
        section.style.setProperty("--presence", String(clamp(1 - Math.max(0, distance - 0.38) * 1.7)));
      });
    };
    const measure = () => { anchors = sections.map((section) => section.offsetTop); update(); };
    const scroll = () => { if (!pending) pending = requestAnimationFrame(update); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); cancelAnimationFrame(pending); window.removeEventListener("scroll", scroll); window.removeEventListener("resize", measure); };
  }, [reduced, status]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);

  function toggleMotion() {
    if (reduced) { setAllowMotion(true); return; }
    input.current.paused = !paused;
    setPaused(!paused);
  }
  const staticExperience = reduced || status === "fallback";

  return (
    <div className="cinema" ref={root} data-scene={status} data-motion={staticExperience ? "static" : paused ? "paused" : "live"}>
      <div className="cinema-world">
        <div className="cinema-poster" aria-hidden="true"><Image src="/art/knowledge-weave.webp" alt="" fill sizes="100vw" preload className="cinema-poster-image" /></div>
        <CinematicStage enabled={!reduced && status !== "fallback"} input={input} onReady={ready} onFailure={failed} onSelect={selectSource} />
        <div className="cinema-vignette" /><div className="cinema-grain" />
      </div>
      <header className="cinema-header">
        <Link href="/" aria-label="Resolvo home"><Brand /></Link>
        <nav className="cinema-desktop-nav" aria-label="Main navigation">{navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
        <div className="cinema-header-actions">
          <Link href="/login" className="cinema-signin">Enter workspace <ArrowUpRight size={15} /></Link>
          <button type="button" className="cinema-menu-toggle" onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="cinema-mobile-navigation">{menu ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
        {menu && <nav id="cinema-mobile-navigation" className="cinema-mobile-nav" aria-label="Mobile navigation">{[...navigation, ["Sign in", "/login"]].map(([label, href]) => <Link href={href} key={href} onClick={() => setMenu(false)}>{label}<ArrowUpRight size={16} /></Link>)}</nav>}
      </header>
      <main id="main-content" className="cinema-story">
        <section id="begin" className="cinema-scene cinema-arrival" aria-labelledby="arrival-title">
          <div className="cinema-window">
            <div className="cinema-copy">
              <p className="cinema-eyebrow"><span className="cinema-live-dot" /> Knowledge, connected.</p>
              <h1 id="arrival-title">Your knowledge.<br /><em>A living thread.</em></h1>
              <p className="cinema-description">From everything your team knows<br className="cinema-desktop-break" /> to the answer that matters.</p>
              <Link href="/login" className="cinema-primary">Open your workspace <ArrowUpRight size={18} /></Link>
            </div>
            <div className="cinema-object-caption" aria-hidden="true"><span className="cinema-cross">+</span> Many sources. One understanding.<span className="cinema-drag-hint">Move to explore · Drag to turn</span></div>
            <a href="#product" className="cinema-scroll-cue"><span className="cinema-scroll-line" /><span>Follow the thread</span><ArrowDown size={13} /></a>
            <span className="cinema-edition" aria-hidden="true">A new perspective on knowledge / 01</span>
          </div>
        </section>
        <section id="product" className="cinema-scene cinema-sources" aria-labelledby="sources-title">
          <div className="cinema-window">
            <div className="cinema-copy">
              <p className="cinema-eyebrow">01 / The gathering</p>
              <h2 id="sources-title">A world of knowledge.<br /><em>One place to begin.</em></h2>
              <p className="cinema-description">Documents. Pages. Ideas.<br />Bring your team’s context together.</p>
              <div className="cinema-source-picker" role="group" aria-label="Explore source types">{SOURCES.map((source, i) => { const Icon = sourceIcons[i]; return <button key={source.name} type="button" aria-pressed={selected === i} onClick={() => selectSource(i as SourceKind)}><Icon size={17} /><span>{source.name}</span><span className="cinema-source-index">0{i + 1}</span></button>; })}</div>
              <p className="cinema-source-detail" aria-live="polite">{SOURCES[selected].detail}</p>
            </div>
            <span className="cinema-scene-note">Explore the illustration · Select a source</span>
          </div>
        </section>
        <section id="how-it-works" className="cinema-scene cinema-connection" aria-labelledby="connection-title">
          <div className="cinema-window">
            <div className="cinema-copy">
              <p className="cinema-eyebrow">02 / The connection</p>
              <h2 id="connection-title">Separate threads.<br /><em>Shared understanding.</em></h2>
              <p className="cinema-description">Ask a question. Follow the connections.</p>
            </div>
            <div className="cinema-coordinate" aria-hidden="true"><span>CONTEXT</span><span className="cinema-coordinate-line" /><span>CLARITY</span></div>
          </div>
        </section>
        <section id="capabilities" className="cinema-scene cinema-evidence" aria-labelledby="evidence-title">
          <div className="cinema-window">
            <div className="cinema-copy">
              <p className="cinema-eyebrow">03 / The evidence</p>
              <h2 id="evidence-title">An answer.<br /><em>And its origins.</em></h2>
              <p className="cinema-description">See the sources behind a response.<br />Keep the conversation connected.</p>
              <div className="cinema-citations" role="group" aria-label="Trace an illustrated source">{SOURCES.map((source, i) => <button key={source.name} type="button" aria-label={`Trace ${source.name.toLowerCase()}`} aria-pressed={selected === i} onClick={() => selectSource(i as SourceKind)}><span>0{i + 1}</span>{source.name}<ArrowUpRight size={13} /></button>)}</div>
              <p className="cinema-source-detail" aria-live="polite">Tracing {SOURCES[selected].name.toLowerCase()} in the illustration.</p>
            </div>
            <span className="cinema-scene-note">Every thread has a source.</span>
          </div>
        </section>
        <section id="your-next-answer" className="cinema-scene cinema-ending" aria-labelledby="ending-title">
          <div className="cinema-window">
            <div className="cinema-copy">
              <p className="cinema-eyebrow">04 / A new beginning</p>
              <h2 id="ending-title">Your next answer<br /><em>starts here.</em></h2>
              <Link href="/login" className="cinema-primary">Find your thread <ArrowRight size={18} /></Link>
            </div>
            <footer className="cinema-footer"><span>Resolvo · Knowledge, connected.</span><a href="#begin">Back to the beginning <ArrowUpRight size={13} /></a></footer>
          </div>
        </section>
      </main>
      <nav className="cinema-chapters" aria-label="Journey chapters">
        <div className="cinema-chapter-track" aria-hidden="true"><span /></div>
        {CHAPTERS.map((item, i) => <a key={item.id} href={`#${item.id}`} aria-label={item.name} aria-current={chapter === i ? "step" : undefined}><span className="cinema-chapter-name">{item.name}</span><span className="cinema-chapter-dot" /></a>)}
      </nav>
      <div className="cinema-controls">
        <span className="cinema-chapter-count"><b>0{chapter + 1}</b><span>/ 05</span></span>
        {status !== "fallback" ? <button type="button" onClick={toggleMotion} aria-label={reduced ? "Enable cinematic motion" : paused ? "Play ambient motion" : "Pause ambient motion"} aria-pressed={!reduced && !paused}>{reduced || paused ? <Play size={12} /> : <Pause size={12} />}<span>{reduced ? "Enable motion" : paused ? "Motion paused" : "Motion on"}</span></button> : <span className="cinema-static-label">Still edition</span>}
      </div>
    </div>
  );
}
