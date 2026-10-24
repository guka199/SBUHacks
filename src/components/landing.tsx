"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUpRight, MoveUpRight, Play, ScanLine, SlidersHorizontal } from "lucide-react";
import { platforms, type PlatformId } from "@/lib/contracts";
import { HeroStage } from "./three/hero-stage";
import { PlatformIcon, Mark } from "./ui";

export function Landing() {
  const [selected, setSelected] = useState<PlatformId>("shorts");
  const active = platforms.find(p => p.id === selected)!;
  return <>
    <section className="hero page-gutter">
      <div className="hero-heading"><h1>Make every<br />frame count.</h1><div className="hero-intro"><p className="lead">One video. Every platform.<br />Smarter decisions.</p><p>Find your video’s strongest platform, sharpen the hook, and make your next cut count.</p><div className="hero-ctas"><Link href="/upload" className="button button-accent">Analyze your video <ArrowUpRight size={21} /></Link><Link href="/demo" className="text-link"><Play size={15} fill="currentColor" /> Explore demo</Link></div></div></div>
      <HeroStage platform={selected} />
      <div className="hero-bottom"><span>For the ideas you can’t keep to yourself.</span><a href="#platforms" className="text-link">Find your fit <ArrowDown size={17} /></a></div>
    </section>
    <section id="platforms" className="platform-section page-gutter">
      <div className="section-heading"><h2>Same idea.<br />Different worlds.</h2><p>Your video doesn’t have to be everything to everyone. Understand what to change for the people on each platform.</p></div>
      <div className="platform-showcase" data-ui>
        <div className="platform-options" role="group" aria-label="Explore platforms">{platforms.map((p) => <button key={p.id} aria-pressed={p.id === selected} onClick={() => setSelected(p.id)} className={`platform-option ${p.id === selected ? "selected" : ""}`}><PlatformIcon id={p.id} size={25} /><span>{p.name}</span><ArrowUpRight size={22} /></button>)}</div>
        <div className="platform-story" key={selected}><div className="aspect-demo"><div className={selected === "youtube" ? "aspect-frame landscape" : "aspect-frame"}><span>{active.format}</span><Play size={32} fill="currentColor" /><span>One idea. Your way.</span></div><span className="aspect-caption">A format with a purpose.</span></div><div><h3>{active.name}</h3><p>{active.note}</p><Link href="/demo" className="text-link">See example insights <MoveUpRight size={18} /></Link></div></div>
      </div>
    </section>
    <section id="how-it-works" className="process-section page-gutter">
      <div className="section-heading"><h2>Less guesswork.<br />More good work.</h2><p>A second perspective on your first draft.<br />From the opening frame to the final caption.</p></div>
      <div className="process-rows">
        <div><span className="process-symbol"><Play /></span><h3>Bring your video.</h3><p>Drop in a draft and choose where you want it to go. Preview it before taking the next step.</p></div>
        <div><span className="process-symbol"><ScanLine /></span><h3>See what stands out.</h3><p>Compare readiness estimates. Explore the hook, pacing, format, and the moments that deserve another look.</p></div>
        <div><span className="process-symbol"><SlidersHorizontal /></span><h3>Make it your own.</h3><p>Try a sharper opening, a better title, or a clearer call to action. Keep the suggestions that sound like you.</p></div>
      </div>
      <p className="honest-note">The demo uses illustrative scores and suggestions. Readiness estimates are creative guidance, never a promise of virality.</p>
    </section>
    <section className="closing-section page-gutter"><h2>Your next great<br />video starts here.</h2><div><p>Bring the idea.<br />We’ll help you find its direction.</p><Link className="button button-dark" href="/upload">Let’s make it count <ArrowUpRight size={23} /></Link></div></section>
    <footer className="site-footer page-gutter"><div className="footer-top"><span className="brand"><Mark /> viralpilot</span><span>Made for creators. Built at SBUHacks.</span><Link href="/demo">Explore the demo <ArrowUpRight size={16} /></Link></div><div className="footer-word" aria-hidden="true">MAKE SOMETHING.</div><p className="credits">Link interaction adapted from <a href="https://skiper-ui.com/">Skiper UI</a>.</p></footer>
  </>;
}
