import { gsap } from "gsap";
export const MONITOR_LOOP_SECONDS = 16;
// Inner panels belong only to this clock; scroll transforms their outer shells.
export function createMonitorLoop(scope: HTMLElement) {
  const q = gsap.utils.selector(scope),
    windows = q(".auto-window"),
    notes = q(".auto-notification"),
    tabs = q(".auto-tab");
  const tl = gsap.timeline({
    repeat: -1,
    paused: true,
    defaults: { ease: "power3.out" },
  });
  tl.set([...windows, ...notes, ...tabs], { autoAlpha: 0 }, 0);
  tl.set(".merge-youtube", { zIndex: 2 }, 0);
  tl.set(".merge-instagram", { zIndex: 3 }, 0);
  tl.set(".merge-tiktok", { zIndex: 4 }, 0);
  tl.set(".merge-youtube", { zIndex: 5 }, 7.1);
  tl.set(".merge-tiktok", { zIndex: 6 }, 8.8);
  tl.set(".merge-instagram", { zIndex: 7 }, 10.1);
  tl.set(".merge-tiktok", { zIndex: 8 }, 12);
  tl.set(
    ".auto-youtube",
    {
      autoAlpha: 1,
      x: 140,
      y: 54,
      scale: 0.92,
      zIndex: 2,
    },
    0,
  );
  tl.set(".auto-instagram", { x: 300, y: 100, scale: 0.84, zIndex: 3 }, 0);
  tl.set(".auto-tiktok", { x: 54, y: 90, scale: 0.9, zIndex: 4 }, 0);
  tl.fromTo(
    ".auto-instagram",
    { autoAlpha: 0, y: 170, scale: 0.74 },
    { autoAlpha: 1, y: 80, scale: 0.84, duration: 0.7, ease: "back.out(1.12)" },
    2.1,
  );
  tl.fromTo(
    ".auto-instagram .aw-bar",
    { scaleY: 0.03, transformOrigin: "50% 100%" },
    { scaleY: 1, stagger: 0.035, duration: 0.6 },
    2.5,
  );
  tl.fromTo(
    ".auto-tiktok",
    { autoAlpha: 0, x: 150, y: 160, scale: 0.75 },
    {
      autoAlpha: 1,
      x: 54,
      y: 110,
      scale: 0.9,
      duration: 0.7,
      ease: "back.out(1.12)",
    },
    4.4,
  );
  tl.fromTo(
    ".auto-tiktok .aw-bar",
    { scaleY: 0.03, transformOrigin: "50% 100%" },
    { scaleY: 1, stagger: 0.035, duration: 0.6 },
    4.9,
  );
  tl.to(".auto-youtube", { x: 28, y: 20, scale: 0.86, duration: 0.7 }, 5.7);
  tl.to(".auto-instagram", { x: 290, y: 28, scale: 0.88, duration: 0.7 }, 5.9);
  tl.set(".merge-youtube", { zIndex: 2 }, 0);
  tl.set(".merge-instagram", { zIndex: 3 }, 0);
  tl.set(".merge-tiktok", { zIndex: 4 }, 0);
  tl.set(".merge-youtube", { zIndex: 5 }, 7.1);
  tl.set(".merge-tiktok", { zIndex: 6 }, 8.8);
  tl.set(".merge-instagram", { zIndex: 7 }, 10.1);
  tl.set(".merge-tiktok", { zIndex: 8 }, 12);
  tl.set(".auto-youtube", { zIndex: 5 }, 7.1).to(
    ".auto-youtube",
    { x: 100, y: 54, scale: 0.94, duration: 0.55 },
    7.1,
  );
  tl.to(
    ".auto-instagram",
    {
      autoAlpha: 0,
      x: 500,
      y: -100,
      scale: 0.7,
      duration: 0.45,
      ease: "power2.in",
    },
    8.2,
  );
  tl.set(".auto-tiktok", { zIndex: 6 }, 8.8).to(
    ".auto-tiktok",
    { x: 225, y: 105, scale: 0.9, duration: 0.6 },
    8.8,
  );
  tl.set(".auto-instagram", { zIndex: 7 }, 10.1).fromTo(
    ".auto-instagram",
    { autoAlpha: 0, x: 340, y: 150, scale: 0.75 },
    {
      autoAlpha: 1,
      x: 250,
      y: 30,
      scale: 0.9,
      duration: 0.65,
      ease: "back.out(1.1)",
    },
    10.1,
  );
  tl.to(
    ".auto-tiktok",
    { autoAlpha: 0, x: -100, y: 230, scale: 0.7, duration: 0.45 },
    11.4,
  )
    .set(".auto-tiktok", { zIndex: 8 }, 12)
    .to(
      ".auto-tiktok",
      { autoAlpha: 1, x: 50, y: 90, scale: 0.92, duration: 0.6 },
      12,
    );
  notes.forEach((note, i) =>
    tl
      .fromTo(
        note,
        { x: 970, y: 65 + i * 63, autoAlpha: 0, scale: 0.9 },
        {
          x: i % 2 ? 570 : 45,
          y: 65 + i * 63,
          autoAlpha: 1,
          scale: 1,
          duration: 0.45,
          ease: "back.out(1.08)",
        },
        5.4 + i * 1.12,
      )
      .to(
        note,
        { autoAlpha: 0, x: 980, duration: 0.45, ease: "power2.in" },
        14.2 + i * 0.12,
      ),
  );
  tabs.forEach((tab, i) =>
    tl
      .fromTo(
        tab,
        { autoAlpha: 0, y: -18 },
        { autoAlpha: 1, y: 0, duration: 0.35 },
        1.2 + i * 1.45,
      )
      .to(tab, { autoAlpha: 0, y: -18, duration: 0.35 }, 14.2 + i * 0.06),
  );
  tl.to(
    ".auto-instagram,.auto-tiktok",
    { autoAlpha: 0, y: 160, scale: 0.8, duration: 0.65, ease: "power2.inOut" },
    14.5,
  );
  tl.to(
    ".auto-youtube",
    { x: 140, y: 54, scale: 0.92, duration: 0.85, ease: "power2.inOut" },
    14.7,
  ).set(".auto-youtube", { zIndex: 2 }, 15.6);
  tl.set(".merge-youtube", { zIndex: 2 }, 15.6);
  tl.to({}, { duration: MONITOR_LOOP_SECONDS - 15.6 }, 15.6);
  tl.eventCallback("onUpdate", () => {
    scope.dataset.loopTime = tl.time().toFixed(2);
    scope.dataset.loopCycle = String(tl.iteration() - 1);
  });
  return tl;
}
