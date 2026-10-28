"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { SceneController, SceneInput } from "./scene";
import type { SourceKind } from "./journey";

export function CinematicStage({ enabled, input, onReady, onFailure, onSelect }: {
  enabled: boolean;
  input: RefObject<SceneInput>;
  onReady: () => void;
  onFailure: () => void;
  onSelect: (kind: SourceKind) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!enabled || !canvas.current) return;
    let cancelled = false;
    let scene: SceneController | undefined;
    const element = canvas.current;
    // Three and all GPU work stay outside the initial document and authenticated routes.
    import("./scene").then(({ createScene }) => {
      if (cancelled) return;
      scene = createScene({ canvas: element, input: input.current, onReady, onFailure, onSelect });
    }).catch(() => { if (!cancelled) onFailure(); });
    return () => { cancelled = true; scene?.dispose(); };
  }, [enabled, input, onReady, onFailure, onSelect]);
  return <canvas className="cinema-canvas" ref={canvas} aria-hidden="true" data-testid="cinematic-canvas" />;
}
