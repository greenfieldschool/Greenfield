"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { HeroRotator } from "@/components/hero-rotator";
import { useInView, useSceneTier } from "./hooks";
import type { SceneFrame } from "./growing-tree-scene";

const Scene = dynamic(() => import("./growing-tree-scene"), { ssr: false });

type Photo = { src: string; alt: string };

// Scene progress while the hero is pinned: the bud at the start, full bloom just before the hero lets go.
const START = 0.06;
const END = 0.31;

/**
 * The home page's first screen. The section is pinned for about two screens: as the visitor scrolls, a hibiscus bud
 * on a grassy mound opens into full bloom (the start of the story the "three stages" section carries on), the
 * headline drifts away and a closing line comes in.
 * - Desktop: the flower sits right of centre, the headline on the left; the camera follows the mouse a little.
 * - Phones: the flower sits high, the text below it; a lighter scene.
 * - Reduced motion: not pinned, no scene, the photo slideshow behind the headline (as before).
 * - No WebGL, Data Saver or a weak device: pinned, with the photos instead of the scene.
 */
export function HeroBloom({ photos, children, closing }: { photos: Photo[]; children: ReactNode; closing: ReactNode }) {
  const section = useRef<HTMLElement | null>(null);
  const progress = useRef(START);
  const tier = useSceneTier();
  const reduced = useReducedMotion();
  const [canvasRef, inView] = useInView<HTMLDivElement>("0px");
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progress.current = START + Math.min(1, v / 0.85) * (END - START);
  });
  const textOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.4], [0, -80]);
  const closingOpacity = useTransform(scrollYProgress, [0.55, 0.8], [0, 1]);
  const closingY = useTransform(scrollYProgress, [0.55, 0.8], [40, 0]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);

  const scene = tier === "lite" || tier === "full";
  const frame: SceneFrame = wide ? { x: -0.55, y: 0 } : { x: 0, y: -0.95 };

  return (
    <section
      ref={section}
      data-cursor="Scroll"
      className="relative h-[210svh] bg-brand-green-950 motion-reduce:h-auto"
      aria-label="Welcome"
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden motion-reduce:relative motion-reduce:h-auto">
        {/* Behind: the 3D flower, or the photos where 3D isn't used. */}
        {tier === "off" || reduced ? (
          <HeroRotator className="absolute inset-0" images={photos} />
        ) : (
          <div
            ref={canvasRef}
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_55%,#17563E_0%,#0B3D2E_40%,#062519_80%)] max-lg:bg-[radial-gradient(ellipse_at_50%_35%,#17563E_0%,#0B3D2E_45%,#062519_85%)]"
            aria-hidden="true"
          >
            {scene ? (
              <div className="absolute inset-0 animate-fade-up">
                <Scene progress={progress} active={inView} lite={tier === "lite"} variant="hero" frame={frame} />
              </div>
            ) : null}
            {/* Keeps the headline readable over the scene. */}
            <div className="absolute inset-0 bg-gradient-to-r from-brand-green-950/80 via-brand-green-950/20 to-transparent max-lg:bg-gradient-to-t max-lg:from-brand-green-950 max-lg:via-brand-green-950/40 max-lg:to-transparent" />
          </div>
        )}

        <motion.div
          style={reduced ? undefined : { opacity: textOpacity, y: textY }}
          className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-28 pt-24 motion-reduce:h-auto lg:justify-center lg:pb-24"
        >
          {children}
        </motion.div>

        {reduced ? null : (
          <>
            {/* Positioned by flex, not translate: framer writes the transform. */}
            <div className="pointer-events-none absolute inset-0 flex items-end pb-28 lg:items-center lg:pb-0">
              <motion.div style={{ opacity: closingOpacity, y: closingY }} className="mx-auto w-full max-w-7xl px-6">
                {closing}
              </motion.div>
            </div>
            <motion.div
              style={{ opacity: cueOpacity }}
              className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 text-xs font-medium text-brand-green-100"
              aria-hidden="true"
            >
              Scroll to watch it grow
              <ChevronDown className="h-4 w-4 animate-bounce" />
            </motion.div>
          </>
        )}
      </div>
    </section>
  );
}
