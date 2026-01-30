"use client";

import Image from "next/image";
import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type HeroImage = {
  src: string;
  alt: string;
};

type HeroRotatorProps = {
  images: HeroImage[];
  intervalMs?: number;
  className?: string;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function HeroRotator({ images, intervalMs = 7000, className }: HeroRotatorProps) {
  const safeImages = useMemo(() => images.filter(Boolean), [images]);
  const prefersReducedMotion = usePrefersReducedMotion();

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  const count = safeImages.length;

  useEffect(() => {
    if (prefersReducedMotion || paused) return;
    if (count <= 1) return;

    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % count);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [count, intervalMs, paused, prefersReducedMotion]);

  function goTo(nextIndex: number) {
    if (count === 0) return;
    const clamped = ((nextIndex % count) + count) % count;
    setActive(clamped);
  }

  function next() {
    goTo(active + 1);
  }

  function prev() {
    goTo(active - 1);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    deltaX.current = 0;
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (startX.current == null) return;
    deltaX.current = e.clientX - startX.current;
  }

  function onPointerUp() {
    if (startX.current == null) return;

    const threshold = 40;
    const dx = deltaX.current;

    startX.current = null;
    deltaX.current = 0;

    if (Math.abs(dx) < threshold) return;

    if (dx < 0) {
      next();
      return;
    }

    prev();
  }

  if (count === 0) return null;

  return (
    <div
      className={className}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="region"
      aria-label="Hero images"
    >
      <div className="absolute inset-0">
        {safeImages.map((img, i) => {
          const isActive = i === active;

          return (
            <div
              key={img.src}
              className={
                "absolute inset-0 transition-opacity duration-700 " +
                (isActive ? "opacity-100" : "opacity-0")
              }
              aria-hidden={!isActive}
            >
              <div
                className={
                  "absolute inset-0 " +
                  (prefersReducedMotion
                    ? ""
                    : isActive
                      ? "motion-safe:animate-[heroZoom_8s_ease-out_forwards]"
                      : "")
                }
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            </div>
          );
        })}

        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-white/0" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,rgba(11,61,46,0.35),transparent_60%),radial-gradient(800px_circle_at_80%_30%,rgba(212,160,23,0.32),transparent_55%)]" />
      </div>

      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          onClick={prev}
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
          aria-label="Previous image"
        >
          <span aria-hidden>‹</span>
        </button>

        <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 backdrop-blur">
          {safeImages.map((_, i) => {
            const isActive = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={
                  "h-2.5 w-2.5 rounded-full transition " +
                  (isActive ? "bg-white" : "bg-white/40 hover:bg-white/70")
                }
                aria-label={`Go to image ${i + 1}`}
                aria-current={isActive ? "true" : undefined}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={next}
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20"
          aria-label="Next image"
        >
          <span aria-hidden>›</span>
        </button>
      </div>

      <style jsx global>{`
        @keyframes heroZoom {
          from {
            transform: scale(1.02);
          }
          to {
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
