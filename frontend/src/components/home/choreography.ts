import { gsap } from "gsap";
import { glassShapes } from "./LiquidGlass";
import type { ExperienceMotion } from "@/lib/experience";
// Scroll owns the outer shells and product demos. The 16s creator loop owns only inner windows.
export function choreograph(
  tl: gsap.core.Timeline,
  s: ExperienceMotion,
  scope: HTMLElement,
  mode: string,
) {
  const q = gsap.utils.selector(scope);
  tl.addLabel("problem", 0)
    .addLabel("meet", 20)
    .addLabel("analysis", 38)
    .addLabel("comparison", 55)
    .addLabel("optimization", 73)
    .addLabel("dashboard", 89)
    .addLabel("enter", 100);
  tl.to(s, { progress: 1, duration: 100, ease: "none" }, 0);
  tl.to(
    s,
    {
      x: 0.12,
      y: 2.2,
      z: 3.35,
      targetX: 0,
      targetY: 1.851,
      targetZ: -0.77,
      duration: 24,
      ease: "power2.inOut",
    },
    0,
  )
    .to(s, { x: 0, y: 2.14, z: 2.8, duration: 14, ease: "sine.inOut" }, 24)
    .to(s, { y: 2.1, z: 2.65, duration: 48, ease: "sine.inOut" }, 38)
    .to(s, { y: 2.09, z: 2, duration: 14, ease: "power2.inOut" }, 86);
  tl.to(
    ".caption-opening,.hero-wash",
    { autoAlpha: 0, y: -20, duration: 9 },
    2,
  );
  if (mode === "flat")
    tl.to(
      ".experience-poster",
      { opacity: 0.16, filter: "blur(6px)", duration: 10 },
      4,
    );
  tl.fromTo(
    ".caption-meet-product",
    { autoAlpha: 0, y: 20 },
    { autoAlpha: 1, y: 0, duration: 4 },
    11,
  ).to(".caption-meet-product", { autoAlpha: 0, y: -12, duration: 4 }, 25);
  tl.to(".creator-desktop", { backgroundColor: "#F7D87F", duration: 10 }, 12);
  tl.to(
    ".auto-window .aw-layout",
    { opacity: 0.18, filter: "blur(2px)", duration: 8 },
    13,
  );
  tl.to(
    ".auto-window .analytics-window",
    {
      borderRadius: "45% 25% 40% 30%",
      backgroundColor: "rgba(248,235,171,.3)",
      duration: 10,
    },
    13,
  );
  q(".chaos-window").forEach((w, i) =>
    tl.to(
      w,
      {
        scaleX: 0.07,
        scaleY: 0.09,
        skewX: i % 2 ? 12 : -12,
        rotation: i % 2 ? 9 : -9,
        borderRadius: "45%",
        duration: 12,
        ease: "power3.inOut",
      },
      14 + i * 0.8,
    ),
  );
  tl.to(
    ".notification-pool,.browser-tab-pool,.desktop-dock,.desktop-status,.monitor-sample-label",
    { autoAlpha: 0, duration: 6 },
    14,
  );
  tl.set(".liquid-field", { autoAlpha: 1 }, 15);
  q(".liquid-piece").forEach((p, i) => {
    const a = (i / 6) * Math.PI * 2;
    tl.fromTo(
      p,
      {
        x: Math.cos(a) * 210,
        y: Math.sin(a) * 120,
        autoAlpha: 0,
        scaleX: 1.2,
        scaleY: 0.6,
        rotation: i % 2 ? 16 : -16,
      },
      { autoAlpha: 0.8, duration: 3 },
      15 + i * 0.2,
    )
      .to(
        p,
        {
          x: 0,
          y: 0,
          scale: 0.6,
          rotation: 0,
          borderRadius: "48%",
          duration: 8,
          ease: "power3.inOut",
        },
        18 + i * 0.2,
      )
      .to(p, { autoAlpha: 0, scale: 0.1, duration: 4 }, 25);
  });
  tl.fromTo(
    ".liquid-core",
    { autoAlpha: 0, scaleX: 0.2, scaleY: 0.4, rotation: -8 },
    {
      autoAlpha: 1,
      scaleX: 1.2,
      scaleY: 0.85,
      rotation: 3,
      duration: 8,
      ease: "power2.inOut",
    },
    17,
  ).to(".liquid-core", { scaleX: 1, scaleY: 1, rotation: 0, duration: 4 }, 25);
  tl.to(
    ".glass-contour",
    { attr: { d: glassShapes.stretched }, duration: 6 },
    18,
  ).to(".glass-contour", { attr: { d: glassShapes.settled }, duration: 5 }, 24);
  tl.fromTo(
    ".liquid-meet",
    { autoAlpha: 0, scale: 0.92 },
    { autoAlpha: 1, scale: 1, duration: 4 },
    22,
  );
  tl.to(".glass-caustic", { xPercent: 35, rotation: 10, duration: 13 }, 16);
  tl.to(".creator-desktop", { autoAlpha: 0, duration: 4 }, 26);
  tl.to(
    ".liquid-core",
    { scale: 1.7, duration: 6, ease: "power2.inOut" },
    27,
  ).to(".liquid-field", { autoAlpha: 0, duration: 5 }, 29);
  tl.fromTo(
    ".product-demonstration",
    { autoAlpha: 0, clipPath: "inset(20% 20% round 90px)", scale: 0.9 },
    { autoAlpha: 1, clipPath: "inset(0% 0% round 0px)", scale: 1, duration: 6 },
    28,
  );
  const scenes = [
    { sel: ".product-analysis", start: 29, end: 46 },
    { sel: ".product-comparison", start: 46, end: 64 },
    { sel: ".product-optimization", start: 64, end: 82 },
    { sel: ".product-unified", start: 82, end: 98 },
  ];
  scenes.forEach(({ sel, start, end }, i) => {
    tl.fromTo(
      sel,
      { autoAlpha: 0, x: 50, scale: 0.98 },
      { autoAlpha: 1, x: 0, scale: 1, duration: 4, ease: "power3.out" },
      start,
    );
    if (i < 3)
      tl.to(sel, { autoAlpha: 0, x: -50, scale: 0.98, duration: 3 }, end - 1);
  });
  tl.fromTo(
    ".demo-video",
    { y: 50, scale: 0.86, autoAlpha: 0 },
    { y: 0, scale: 1, autoAlpha: 1, duration: 5, ease: "back.out(1.05)" },
    31,
  );
  tl.fromTo(
    ".demo-upload-track i",
    { scaleX: 0 },
    { scaleX: 1, transformOrigin: "left", duration: 6, ease: "power1.inOut" },
    33,
  );
  tl.to(".upload-cloud", { autoAlpha: 0, duration: 1 }, 38).fromTo(
    ".upload-check",
    { autoAlpha: 0, scale: 0.4 },
    { autoAlpha: 1, scale: 1, duration: 2, ease: "back.out(1.3)" },
    38,
  );
  tl.fromTo(
    ".analysis-step",
    { autoAlpha: 0.2, x: 20 },
    { autoAlpha: 1, x: 0, duration: 2, stagger: 2 },
    35,
  );
  tl.fromTo(
    ".analysis-step > svg",
    { scale: 0 },
    { scale: 1, duration: 1.2, stagger: 2, ease: "back.out(1.4)" },
    37,
  );
  tl.fromTo(
    ".demo-score-track i",
    { scaleX: 0, transformOrigin: "left" },
    { scaleX: 1, duration: 7, stagger: 1.1, ease: "power3.out" },
    49,
  );
  tl.fromTo(
    ".demo-platform-row strong",
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 3, stagger: 1.1 },
    51,
  );
  tl.fromTo(
    ".copy-before",
    { x: 30, rotation: 2, autoAlpha: 0 },
    { x: 0, rotation: 0, autoAlpha: 1, duration: 4 },
    65,
  );
  tl.fromTo(
    ".copy-after",
    { x: 100, rotation: -3, autoAlpha: 0 },
    { x: 0, rotation: 0, autoAlpha: 1, duration: 5, ease: "power3.out" },
    69,
  );
  tl.fromTo(
    ".copy-after p",
    { autoAlpha: 0, y: 8 },
    { autoAlpha: 1, y: 0, duration: 2, stagger: 1.2 },
    72,
  );
  tl.fromTo(
    ".optimized i",
    { scaleX: 0.5 },
    { scaleX: 1, duration: 3, stagger: 0.3, ease: "back.out(1.2)" },
    76,
  );
  tl.fromTo(
    ".unified-report",
    { y: 50, scale: 0.9, rotation: 3 },
    { y: 0, scale: 1, rotation: 0, duration: 6, ease: "power3.out" },
    84,
  );
  tl.fromTo(
    ".monitor-application",
    { autoAlpha: 0, y: 30 },
    { autoAlpha: 1, y: 0, duration: 5 },
    95,
  );
  tl.to(".product-demonstration", { autoAlpha: 0, duration: 4 }, 96);
  tl.to(".experience-scroll", { autoAlpha: 0, duration: 3 }, 97);
}
