"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Pause, Play } from "lucide-react";
import styles from "./dragon-artwork.module.css";

const path = "/art/auth-dragon/";
const particles = [
  [65, 22],
  [79, 28],
  [86, 58],
  [57, 53],
  [73, 72],
  [92, 39],
];

/** Each motion owns a different nested wrapper. Auth requests never wait for art. */
export function DragonArtwork({ shimmerKey }: { shimmerKey: number }) {
  const root = useRef<HTMLDivElement>(null);
  const shimmer = useRef<(() => void) | null>(null);
  const sync = useRef<(() => void) | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"pending" | "static" | "animated">(
    "pending",
  );

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia(
      "(hover: hover) and (pointer: fine) and (min-width: 950px)",
    );
    const update = () =>
      setMode(!reduce.matches && fine.matches ? "animated" : "static");
    update();
    reduce.addEventListener("change", update);
    fine.addEventListener("change", update);
    return () => {
      reduce.removeEventListener("change", update);
      fine.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    sync.current?.();
  }, [paused]);

  useEffect(() => {
    if (shimmerKey > 0) shimmer.current?.();
  }, [shimmerKey]);

  useEffect(() => {
    const element = root.current;
    const scene = element?.parentElement;
    if (!element || !scene || mode !== "animated") return;
    let disposed = false;
    let visible = true;
    let frame = 0;
    let previous = 0;
    let context: gsap.Context | undefined;
    let entrance: gsap.core.Timeline | undefined;
    const loops: gsap.core.Animation[] = [];
    let light: gsap.core.Timeline | undefined;
    const target = { x: 0, y: 0 };
    const position = { x: 0, y: 0 };
    const shifts = [...element.querySelectorAll<HTMLElement>("[data-depth]")];
    const economy = navigator.hardwareConcurrency <= 4;
    element.dataset.economy = String(economy);
    const running = () =>
      !disposed && !document.hidden && visible && !pausedRef.current;

    // Pointer writes are isolated from GSAP's entrance, breathing and flow transforms.
    const write = () =>
      shifts.forEach((node) => {
        const depth = Number(node.dataset.depth) * (economy ? 0.5 : 1);
        node.style.transform = `translate3d(${(position.x * depth).toFixed(3)}px,${(position.y * depth * 0.65).toFixed(3)}px,0)`;
      });
    const step = (now: number) => {
      frame = 0;
      if (!running()) return;
      const elapsed = previous ? Math.min(64, now - previous) : 16.67;
      previous = now;
      const blend = 1 - Math.exp(-elapsed / 165);
      position.x += (target.x - position.x) * blend;
      position.y += (target.y - position.y) * blend;
      write();
      if (
        Math.abs(target.x - position.x) + Math.abs(target.y - position.y) >
        0.001
      )
        frame = requestAnimationFrame(step);
      else previous = 0;
    };
    const schedule = () => {
      if (!frame && running()) frame = requestAnimationFrame(step);
    };
    const leave = () => {
      target.x = target.y = 0;
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !running()) return;
      const rect = element.getBoundingClientRect();
      target.x = Math.max(
        -1,
        Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
      );
      target.y = Math.max(
        -1,
        Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
      schedule();
    };
    const visibility = () => {
      const play = running();
      // Pausing during loading/entrance should leave a complete still artwork.
      if (pausedRef.current && entrance && entrance.progress() < 1)
        entrance.progress(1);
      entrance?.paused(!play);
      loops.forEach((animation) => animation.paused(!play));
      if (!play) {
        cancelAnimationFrame(frame);
        frame = previous = 0;
        target.x = target.y = position.x = position.y = 0;
        write();
        light?.pause(0);
      }
    };
    sync.current = visibility;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visibility();
    });
    observer.observe(element);
    scene.addEventListener("pointermove", move, { passive: true });
    scene.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);

    // Decode before staging the layered entrance; the form is already usable.
    Promise.all(
      [...element.querySelectorAll<HTMLImageElement>("img")].map((image) =>
        image.decode().catch(() => undefined),
      ),
    ).then(() => {
      if (disposed) return;
      const images = [...element.querySelectorAll<HTMLImageElement>("img")];
      if (images.some((image) => !image.naturalWidth)) {
        element.dataset.failed = "true";
        return;
      }
      context = gsap.context(() => {
        entrance = gsap
          .timeline({ defaults: { ease: "sine.out" } })
          .fromTo(
            `.${styles.paper}`,
            { opacity: 0 },
            { opacity: 1, duration: 0.45 },
            0,
          )
          .fromTo(
            `.${styles.sunEntrance}`,
            { opacity: 0, scale: 0.997 },
            { opacity: 1, scale: 1, duration: 0.7 },
            0.2,
          )
          .fromTo(
            `.${styles.dragonEntrance}`,
            { opacity: 0, y: 1.2 },
            { opacity: 1, y: 0, duration: 0.85 },
            0.4,
          )
          .fromTo(
            `.${styles.waveEntrance}`,
            { opacity: 0 },
            { opacity: 1, duration: 0.65 },
            0.6,
          )
          .to(`.${styles.reference}`, { opacity: 1, duration: 0.45 }, 1.05)
          .fromTo(
            `.${styles.motes}`,
            { opacity: 0 },
            { opacity: 1, duration: 0.3 },
            1.2,
          );
        // Supplied masks overlap: subpixel loops avoid doubled linework and seams.
        loops.push(
          gsap.to(`.${styles.breathe}`, {
            y: -0.55,
            scale: 1.003,
            duration: 3.5,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: 1.1,
          }),
        );
        loops.push(
          gsap.fromTo(
            `.${styles.cloudDrift}`,
            { x: -0.35 },
            {
              x: 0.35,
              duration: 12.5,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
              delay: 0.8,
            },
          ),
        );
        loops.push(
          gsap.fromTo(
            `.${styles.waveFlow}`,
            { x: -0.45 },
            {
              x: 0.45,
              duration: 7.5,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
              delay: 0.8,
            },
          ),
        );
        element
          .querySelectorAll<HTMLElement>(`.${styles.mote}`)
          .forEach((mote, index) => {
            loops.push(
              gsap
                .timeline({
                  repeat: -1,
                  delay: 1.2 + index * 1.3,
                  repeatDelay: 2 + index * 0.4,
                })
                .fromTo(
                  mote,
                  { opacity: 0, y: 0 },
                  { opacity: 0.22, y: -9, duration: 4.5, ease: "sine.inOut" },
                )
                .to(mote, {
                  opacity: 0,
                  y: -19,
                  duration: 5.5,
                  ease: "sine.inOut",
                }),
            );
          });
        light = gsap
          .timeline({ paused: true })
          .fromTo(
            `.${styles.shimmer}`,
            { xPercent: -140, opacity: 0 },
            {
              xPercent: 100,
              opacity: 0.18,
              duration: 0.38,
              ease: "sine.inOut",
            },
          )
          .to(`.${styles.shimmer}`, {
            xPercent: 175,
            opacity: 0,
            duration: 0.34,
            ease: "sine.out",
          });
      }, element);
      shimmer.current = () => {
        if (running()) light?.restart();
      };
      element.dataset.ready = "true";
      visibility();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.removeEventListener("pointermove", move);
      scene.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      context?.revert();
      shifts.forEach((node) => node.style.removeProperty("transform"));
      delete element.dataset.ready;
      delete element.dataset.failed;
      shimmer.current = sync.current = null;
    };
  }, [mode]);

  const layer = (name: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- precompressed, exactly aligned user artwork
    <img
      className={styles.image}
      src={`${path}${name}.webp`}
      width={1855}
      height={848}
      alt=""
      draggable={false}
      decoding="async"
    />
  );
  return (
    <>
      <div
        ref={root}
        className={styles.art}
        data-mode={mode}
        data-paused={paused}
        aria-hidden="true"
      >
        <div className={styles.paper} />
        <div className={styles.reference} data-depth="-0.7">
          <div className={styles.cloudDrift}>
            <picture>
              <source
                media="(max-width: 949px)"
                srcSet={`${path}reference-mobile.webp`}
              />
              {layer("reference_full")}
            </picture>
          </div>
        </div>
        {mode === "animated" && (
          <>
            <div className={styles.shift} data-depth="-0.9">
              <div className={styles.sunEntrance}>{layer("sun")}</div>
            </div>
            <div className={styles.shift} data-depth="1.6">
              <div className={styles.dragonEntrance}>
                <div className={styles.breathe}>{layer("dragon")}</div>
              </div>
            </div>
            <div className={styles.shift} data-depth="-0.7">
              <div className={styles.waveEntrance}>
                <div className={styles.waveFlow}>{layer("waves")}</div>
              </div>
            </div>
            <div className={styles.motes}>
              {particles.map(([x, y], index) => (
                <i
                  key={index}
                  className={styles.mote}
                  style={{ left: `${x}%`, top: `${y}%` }}
                />
              ))}
            </div>
            <div className={styles.shimmer} />
          </>
        )}
      </div>
      {mode === "animated" && (
        <button
          type="button"
          className={styles.pause}
          aria-pressed={paused}
          aria-label={
            paused ? "Resume artwork animation" : "Pause artwork animation"
          }
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
          <span>{paused ? "Artwork paused" : "Pause artwork"}</span>
        </button>
      )}
    </>
  );
}
