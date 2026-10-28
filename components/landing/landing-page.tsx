"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Maximize2,
  Menu,
  Pause,
  Play,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { CinematicStage } from "./cinematic/cinematic-stage";
import {
  CHAPTERS,
  THREAD_PALETTES,
  clamp,
  scrollProgress,
  smoothstep,
} from "./cinematic/journey";
import type { SceneInput } from "./cinematic/scene";
import "./cinematic.css";

const navigation = [
  ["The workspace", "#product"],
  ["Capabilities", "#capabilities"],
  ["How it works", "#how-it-works"],
];
function subscribeMotion(callback: () => void) {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotion = () => true;

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const [paused, setPaused] = useState(false);
  const [allowMotion, setAllowMotion] = useState(false);
  const [palette, setPalette] = useState(0);
  const [inspect, setInspect] = useState(false);
  const [chapter, setChapter] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    serverMotion,
  );
  const reduced = reducedMotion && !allowMotion;
  const staticExperience = reduced || status === "fallback";
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<SceneInput>({
    progress: 0,
    paused: false,
    palette: 0,
    inspect: false,
  });
  const ready = useCallback(() => setStatus("ready"), []);
  const failed = useCallback(() => setStatus("fallback"), []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const sections = CHAPTERS.map(({ id }) => document.getElementById(id)!);
    let anchors: number[] = [],
      pending = 0;
    const paint = () => {
      pending = 0;
      const progress = input.current.progress,
        position = progress * (CHAPTERS.length - 1);
      element.style.setProperty("--journey-progress", String(progress));
      const rightShade = smoothstep(
        0.05,
        0.8,
        Math.max(0, 1 - Math.abs(position - 1), 1 - Math.abs(position - 5)),
      );
      element.style.setProperty("--shade-right", String(rightShade));
      setChapter(Math.min(CHAPTERS.length - 1, Math.round(position)));
      sections.forEach((section, i) => {
        section.style.setProperty(
          "--presence",
          String(clamp(1 - Math.max(0, Math.abs(position - i) - 0.4) * 1.8)),
        );
      });
    };
    // Native scrolling writes the target immediately. Only DOM paint is scheduled;
    // the renderer owns the sole smoothing step for camera, needle and stitches.
    const scroll = () => {
      input.current.progress = scrollProgress(window.scrollY, anchors);
      if (!pending) pending = requestAnimationFrame(paint);
    };
    const measure = () => {
      anchors = sections.map((section) => section.offsetTop);
      scroll();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", measure);
    };
  }, [staticExperience]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);

  function toggleMotion() {
    if (reduced) {
      setAllowMotion(true);
      return;
    }
    input.current.paused = !paused;
    setPaused(!paused);
  }
  function selectPalette(index: number) {
    input.current.palette = index;
    setPalette(index);
  }
  function toggleInspect() {
    input.current.inspect = !inspect;
    setInspect(!inspect);
  }

  return (
    <div
      className="cinema"
      ref={root}
      data-scene={status}
      data-chapter={chapter}
      data-inspect={inspect}
      data-motion={staticExperience ? "static" : paused ? "paused" : "live"}
    >
      <div className="cinema-world">
        <div className="cinema-poster" aria-hidden="true">
          <Image
            src="/art/embroidery-machine.webp"
            alt=""
            fill
            sizes="100vw"
            preload
            className="cinema-poster-image"
          />
        </div>
        <CinematicStage
          enabled={!reduced && status !== "fallback"}
          input={input}
          onReady={ready}
          onFailure={failed}
        />
        <div className="cinema-vignette" />
        <div className="cinema-grain" />
      </div>
      <header className="cinema-header">
        <Link href="/" aria-label="Resolvo home">
          <Brand />
        </Link>
        <nav className="cinema-desktop-nav" aria-label="Main navigation">
          {navigation.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="cinema-header-actions">
          <Link href="/login" className="cinema-signin">
            Enter workspace <ArrowUpRight size={15} />
          </Link>
          <button
            type="button"
            className="cinema-menu-toggle"
            onClick={() => setMenu(!menu)}
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="cinema-mobile-navigation"
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menu && (
          <nav
            id="cinema-mobile-navigation"
            className="cinema-mobile-nav"
            aria-label="Mobile navigation"
          >
            {[...navigation, ["Sign in", "/login"]].map(([label, href]) => (
              <Link href={href} key={href} onClick={() => setMenu(false)}>
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main id="main-content" className="cinema-story">
        {CHAPTERS.map((item, i) => (
          <section
            key={item.id}
            id={item.id}
            className={`cinema-scene cinema-shot-${i}`}
            style={{ "--chapter-height": `${item.height}svh` } as CSSProperties}
            aria-labelledby={`${item.id}-title`}
          >
            <div className="cinema-window">
              {staticExperience && i === 7 && (
                <div className="cinema-finished-still">
                  <Image
                    src="/art/embroidery-finished.webp"
                    alt="The completed kingfisher, embroidered in teal, indigo and copper on ivory linen."
                    width={1400}
                    height={1000}
                    sizes="(max-width: 900px) 90vw, 60vw"
                    loading="eager"
                  />
                </div>
              )}
              <div className="cinema-copy">
                <p className="cinema-eyebrow">
                  {i === 0 && <span className="cinema-live-dot" />}
                  {item.label}
                </p>
                {i === 0 ? (
                  <h1 id={`${item.id}-title`}>
                    {item.title}
                    <br />
                    <em>{item.emphasis}</em>
                  </h1>
                ) : (
                  <h2 id={`${item.id}-title`}>
                    {item.title}
                    <br />
                    <em>{item.emphasis}</em>
                  </h2>
                )}
                <p className="cinema-description">{item.text}</p>
                {i === 0 && (
                  <Link href="/login" className="cinema-primary">
                    Open your workspace <ArrowUpRight size={17} />
                  </Link>
                )}
                {i === 5 && !staticExperience && (
                  <div
                    className="cinema-palette"
                    role="group"
                    aria-label="Thread palette"
                  >
                    {THREAD_PALETTES.map((option, index) => (
                      <button
                        key={option.name}
                        type="button"
                        aria-pressed={palette === index}
                        onClick={() => selectPalette(index)}
                      >
                        <span className="cinema-swatches" aria-hidden="true">
                          {option.colors.map((color) => (
                            <span
                              key={color}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                        <span>{option.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {i === 7 && !staticExperience && (
                  <button
                    type="button"
                    className="cinema-inspect"
                    aria-pressed={inspect}
                    onClick={toggleInspect}
                  >
                    <Maximize2 size={14} />
                    {inspect ? "View the whole piece" : "Inspect the stitching"}
                  </button>
                )}
                {i === 8 && (
                  <Link href="/login" className="cinema-primary">
                    Find your thread <ArrowRight size={17} />
                  </Link>
                )}
              </div>
              {i === 0 && (
                <>
                  <div className="cinema-object-caption" aria-hidden="true">
                    <span className="cinema-caption-line" />
                    <span>The connection collection</span>
                    <span className="cinema-drag-hint">
                      Move to explore · Drag to turn
                    </span>
                  </div>
                  <a href="#product" className="cinema-scroll-cue">
                    <span className="cinema-scroll-line" />
                    Follow the thread
                    <ArrowDown size={13} />
                  </a>
                  <span className="cinema-edition" aria-hidden="true">
                    An exploration of craft & connection
                  </span>
                </>
              )}
              {i > 0 && i < 8 && (
                <span className="cinema-scene-note" aria-hidden="true">
                  {
                    [
                      "",
                      "From imagination to intention",
                      "Warp × weft / The foundation",
                      "A single thread changes everything",
                      "A study in connection",
                      "Choose your thread",
                      "The things you notice up close",
                      "Kingfisher / A study in connection",
                    ][i]
                  }
                </span>
              )}
              {i === 8 && (
                <footer className="cinema-footer">
                  <span>Resolvo · Knowledge, connected.</span>
                  <a href="#begin">
                    Begin again <ArrowUpRight size={13} />
                  </a>
                </footer>
              )}
            </div>
          </section>
        ))}
      </main>
      <nav className="cinema-chapters" aria-label="Journey chapters">
        <div className="cinema-chapter-track" aria-hidden="true">
          <span />
        </div>
        {CHAPTERS.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-label={item.name}
            aria-current={chapter === i ? "step" : undefined}
          >
            <span className="cinema-chapter-name">{item.name}</span>
            <span className="cinema-chapter-dot" />
          </a>
        ))}
      </nav>
      <div className="cinema-controls">
        <span className="cinema-chapter-count">
          <b>0{chapter + 1}</b>
          <span>/ 09</span>
          <span className="cinema-current-name">{CHAPTERS[chapter].name}</span>
        </span>
        {status !== "fallback" ? (
          <button
            type="button"
            onClick={toggleMotion}
            aria-label={
              reduced
                ? "Enable cinematic motion"
                : paused
                  ? "Play ambient motion"
                  : "Pause ambient motion"
            }
            aria-pressed={!reduced && !paused}
          >
            {reduced || paused ? <Play size={12} /> : <Pause size={12} />}
            <span>
              {reduced
                ? "Enable motion"
                : paused
                  ? "Motion paused"
                  : "Motion on"}
            </span>
          </button>
        ) : (
          <span className="cinema-static-label">Still edition</span>
        )}
      </div>
    </div>
  );
}
