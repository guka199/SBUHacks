import { gsap } from "gsap";
import type { ExperienceMotion } from "@/lib/experience";
import { glassShapes } from "./LiquidGlass";

// One playhead owns camera, interfaces, graphs and glass in both scroll directions.
export function choreograph(
  tl: gsap.core.Timeline,
  s: ExperienceMotion,
  scope: HTMLElement,
  mode: string,
) {
  const q = gsap.utils.selector(scope),
    windows = q(".chaos-window"),
    notes = q(".chaos-notification"),
    pieces = q(".liquid-piece"),
    tabs = q(".browser-extra-tab");
  tl.addLabel("peaceful", 0)
    .addLabel("youtube", 17)
    .addLabel("platforms", 31)
    .addLabel("overload", 48)
    .addLabel("glass", 70)
    .addLabel("clarity", 83)
    .addLabel("studio", 90)
    .addLabel("enter", 100);
  tl.to(s, { progress: 1, duration: 100, ease: "none" }, 0);
  tl.to(
    s,
    {
      x: 0.12,
      y: 2.23,
      z: 3.7,
      targetY: 1.851,
      targetZ: -0.77,
      duration: 18,
      ease: "power2.inOut",
    },
    2,
  )
    .to(
      s,
      {
        x: 0.035,
        y: 2.17,
        z: 2.95,
        targetY: 1.851,
        duration: 24,
        ease: "power1.inOut",
      },
      20,
    )
    .to(s, { x: 0, y: 2.13, z: 2.7, duration: 28, ease: "sine.inOut" }, 44)
    .to(s, { x: 0, y: 2.11, z: 2.55, duration: 18, ease: "sine.inOut" }, 72)
    .to(s, { x: 0, y: 2.09, z: 2.0, duration: 10, ease: "power2.inOut" }, 90);
  if (mode === "flat") {
    tl.to(
      ".experience-poster",
      { opacity: 0.2, filter: "blur(5px)", duration: 12 },
      12,
    );
    tl.fromTo(
      ".monitor-experience",
      { backgroundColor: "rgba(167,192,182,0)" },
      { backgroundColor: "rgba(167,192,182,1)", duration: 6 },
      16,
    );
  }
  tl.to(".caption-opening", { autoAlpha: 0, y: -20, duration: 7 }, 5);
  tl.fromTo(
    ".caption-tools",
    { autoAlpha: 0, y: 16 },
    { autoAlpha: 1, y: 0, duration: 5 },
    17,
  ).to(".caption-tools", { autoAlpha: 0, y: -12, duration: 4 }, 43);
  tl.fromTo(
    ".caption-overload",
    { autoAlpha: 0, y: 16 },
    { autoAlpha: 1, y: 0, duration: 5 },
    47,
  ).to(".caption-overload", { autoAlpha: 0, y: -12, duration: 4 }, 68);
  tl.to(".calm-layer", { autoAlpha: 0, duration: 8 }, 17);
  const openings = [
    { selector: ".window-youtube", x: 70, y: 25, t: 17, scale: 1.18 },
    { selector: ".window-instagram", x: 235, y: 60, t: 31, scale: 1.08 },
    { selector: ".window-tiktok", x: 82, y: 46, t: 41, scale: 1.14 },
    { selector: ".window-extra-one", x: -180, y: -55, t: 51, scale: 0.85 },
    { selector: ".window-extra-two", x: 430, y: 220, t: 57, scale: 0.85 },
  ];
  openings.forEach(({ selector, x, y, t, scale }, i) => {
    // Anticipation, curved two-part travel, then a heavy panel's quiet settle.
    tl.fromTo(
      selector,
      {
        x: x + 80,
        y: y + 90,
        scale: scale * 0.82,
        rotation: i % 2 ? -2 : 2,
        autoAlpha: 0,
      },
      {
        x: x + 18,
        y: y - 10,
        scale: scale * 1.015,
        rotation: 0,
        autoAlpha: 1,
        duration: 4,
        ease: "power3.out",
      },
      t,
    ).to(selector, { x, y, scale, duration: 2, ease: "power2.inOut" }, t + 4);
    q(`${selector} .aw-line`).forEach((line) =>
      tl.fromTo(
        line,
        { strokeDasharray: 1, strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 7, ease: "power2.out" },
        t + 2,
      ),
    );
    const bars = q(`${selector} .aw-bar`);
    if (bars.length)
      tl.fromTo(
        bars,
        { scaleY: 0.02, transformOrigin: "50% 100%" },
        { scaleY: 1, duration: 4, stagger: 0.12, ease: "power3.out" },
        t + 2,
      );
    tl.fromTo(
      q(`${selector} .aw-metrics`),
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 4, ease: "power2.out" },
      t + 1,
    );
  });
  tl.to(".window-youtube", { x: -88, y: -35, scale: 0.97, duration: 6 }, 30);
  tl.to(".window-instagram", { x: 275, y: 4, scale: 1, duration: 6 }, 41);
  tl.to(".window-tiktok", { x: 100, y: 125, scale: 1.03, duration: 8 }, 51);
  tabs.forEach((tab, i) =>
    tl.fromTo(
      tab,
      { autoAlpha: 0, y: -14, scaleX: 0.7 },
      { autoAlpha: 1, y: 0, scaleX: 1, duration: 3, ease: "power3.out" },
      25 + i * 4.7,
    ),
  );
  notes.forEach((note, i) => {
    const x = 25 + (i % 3) * 282 + (i % 2) * 7,
      y = 58 + Math.floor(i / 3) * 106;
    tl.fromTo(
      note,
      { x: 960, y: y + 12, autoAlpha: 0, scale: 0.94, rotation: 0 },
      {
        x: x - 7,
        y: y - 3,
        autoAlpha: 1,
        scale: 1.01,
        rotation: ((i % 3) - 1) * 0.6,
        duration: 2.5,
        ease: "power3.out",
      },
      44 + i * 2,
    ).to(
      note,
      { x, y, scale: 1, duration: 1.5, ease: "power2.inOut" },
      46.5 + i * 2,
    );
  });
  tl.to(
    windows,
    {
      backgroundColor: "rgba(244,250,246,.12)",
      backdropFilter: "blur(16px)",
      borderRadius: 28,
      duration: 7,
    },
    69,
  );
  tl.to(
    ".chaos-window .analytics-window",
    {
      backgroundColor: "rgba(244,250,246,.15)",
      boxShadow:
        "0 18px 38px rgba(15,44,35,.12), inset 0 1px rgba(255,255,255,.8)",
      duration: 7,
    },
    69,
  );
  tl.to(
    ".chaos-window .aw-layout",
    { opacity: 0.14, filter: "blur(1px)", duration: 7 },
    70,
  );
  tl.to(".chaos-window .aw-chrome", { opacity: 0.4, duration: 7 }, 70);
  tl.to(
    notes,
    {
      backgroundColor: "rgba(248,253,250,.2)",
      backdropFilter: "blur(14px)",
      borderRadius: 28,
      duration: 7,
    },
    70,
  );
  tl.to(".chaos-notification > *", { opacity: 0.15, duration: 7 }, 70);
  windows.forEach((window, i) =>
    tl.to(
      window,
      {
        x: 215 + (i % 3) * 14,
        y: 165 + (i % 2) * 15,
        scaleX: 0.65,
        scaleY: 0.46,
        skewX: i % 2 ? 5 : -5,
        rotation: i % 2 ? 8 : -8,
        borderRadius: "48% 28% 42% 30%",
        duration: 10,
        ease: "power2.inOut",
      },
      74 + i * 0.3,
    ),
  );
  notes.forEach((note, i) =>
    tl.to(
      note,
      {
        x: 335 + (i % 3) * 8,
        y: 235,
        scaleX: 0.7,
        scaleY: 0.65,
        rotation: (i % 2 ? 1 : -1) * 12,
        borderRadius: "45%",
        duration: 9,
        ease: "power2.inOut",
      },
      74 + i * 0.15,
    ),
  );
  tl.fromTo(
    ".glass-message",
    { autoAlpha: 0, y: 18 },
    { autoAlpha: 1, y: 0, duration: 5 },
    72,
  ).to(".glass-message", { autoAlpha: 0, y: -10, duration: 3 }, 86);
  tl.set(".liquid-field", { autoAlpha: 1 }, 76);
  pieces.forEach((piece, i) => {
    const angle = (i / 6) * Math.PI * 2;
    tl.fromTo(
      piece,
      {
        x: Math.cos(angle) * 225,
        y: Math.sin(angle) * 110,
        scaleX: 1.1,
        scaleY: 0.8,
        rotation: i % 2 ? -18 : 18,
        autoAlpha: 0,
      },
      { autoAlpha: 0.75, scaleX: 1.25, scaleY: 0.55, duration: 3 },
      76 + i * 0.15,
    )
      .to(
        piece,
        {
          x: Math.cos(angle) * 20,
          y: Math.sin(angle) * 10,
          scaleX: 0.8,
          scaleY: 1,
          rotation: 0,
          borderRadius: "48%",
          duration: 7,
          ease: "power2.inOut",
        },
        78 + i * 0.15,
      )
      .to(piece, { autoAlpha: 0, scale: 0.4, duration: 3 }, 84 + i * 0.1);
  });
  tl.fromTo(
    ".liquid-core",
    { autoAlpha: 0, scaleX: 0.2, scaleY: 0.35, rotation: -4 },
    {
      autoAlpha: 1,
      scaleX: 1.12,
      scaleY: 0.8,
      rotation: 2,
      duration: 6,
      ease: "power2.inOut",
    },
    78,
  ).to(
    ".liquid-core",
    { scaleX: 1, scaleY: 1, rotation: 0, duration: 4, ease: "power3.out" },
    84,
  );
  tl.to(
    ".glass-contour",
    { attr: { d: glassShapes.stretched }, duration: 5, ease: "power2.inOut" },
    79,
  ).to(
    ".glass-contour",
    { attr: { d: glassShapes.settled }, duration: 5, ease: "power3.out" },
    84,
  );
  tl.fromTo(
    ".glass-caustic",
    { xPercent: -30, rotation: -18 },
    { xPercent: 20, rotation: -8, duration: 10, ease: "sine.inOut" },
    78,
  );
  tl.to(
    [...windows, ...notes, ...tabs],
    {
      autoAlpha: 0,
      x: 425,
      y: 250,
      scale: 0.06,
      skewX: 0,
      duration: 6,
      ease: "power3.in",
    },
    81,
  );
  tl.fromTo(
    ".liquid-meet",
    { autoAlpha: 0, scale: 0.92 },
    { autoAlpha: 1, scale: 1, duration: 4, ease: "power3.out" },
    84,
  ).to(".liquid-meet", { autoAlpha: 0, duration: 2 }, 90);
  tl.to(
    ".liquid-core",
    { scaleX: 1.55, scaleY: 1.5, duration: 5, ease: "power2.inOut" },
    88,
  );
  tl.fromTo(
    ".monitor-application",
    {
      autoAlpha: 0,
      clipPath: "inset(31% 26% 31% 26% round 100px)",
      scale: 0.94,
    },
    {
      autoAlpha: 1,
      clipPath: "inset(0% 0% 0% 0% round 0px)",
      scale: 1,
      duration: 8,
      ease: "power3.inOut",
    },
    90,
  );
  tl.to(".liquid-field", { autoAlpha: 0, duration: 4 }, 94);
  tl.to(".monitor-sample-label", { autoAlpha: 0, duration: 3 }, 70);
  tl.to(".skip-experience", { autoAlpha: 0, duration: 3 }, 86);
  tl.to(
    ".experience-controls,.experience-scroll",
    { autoAlpha: 0, duration: 2 },
    98,
  );
}
