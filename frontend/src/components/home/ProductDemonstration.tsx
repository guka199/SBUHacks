"use client";
import {
  ArrowUpRight,
  Check,
  Film,
  Play,
  ScanLine,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Mark, PlatformIcon } from "../ui";
import { makeDemoResult } from "@/lib/demo";
const report = makeDemoResult();
function Chrome() {
  return (
    <header className="product-chrome">
      <span>
        <Mark /> viralpilot
      </span>
      <span>CREATOR STUDIO</span>
      <b>Illustrative demo</b>
    </header>
  );
}
export function ProductDemonstration() {
  return (
    <div className="product-demonstration" aria-hidden="true">
      <Chrome />
      <section className="product-scene product-analysis">
        <div className="product-scene-heading">
          <span>01 / UNDERSTAND YOUR VIDEO</span>
          <h2>
            Good content starts
            <br />
            with a closer look.
          </h2>
          <p>Hooks. Pacing. Captions. The moments worth another cut.</p>
        </div>
        <div className="analysis-workbench">
          <div className="demo-video">
            <div className="demo-video-art">
              <Play size={36} />
              <strong>
                MAKE
                <br />
                SOMETHING.
              </strong>
              <span>YOUR NEXT BIG IDEA / 00:24</span>
            </div>
            <div className="demo-video-file">
              <Film size={18} />
              <span>
                creative-draft.mp4<small>24 seconds · 9:16</small>
              </span>
              <Check className="upload-check" size={18} />
              <UploadCloud className="upload-cloud" size={18} />
            </div>
            <div className="demo-upload-track">
              <i />
            </div>
          </div>
          <div className="analysis-steps">
            {[
              ["Hook", "A first frame worth staying for."],
              ["Pacing", "Two moments could move faster."],
              ["Captions", "Make the story work on mute."],
              ["Opportunities", "Bring the payoff forward."],
            ].map(([name, detail], i) => (
              <div className={`analysis-step analysis-step-${i}`} key={name}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{name}</b>
                  <p>{detail}</p>
                </div>
                <Check size={18} />
              </div>
            ))}
          </div>
        </div>
        <p className="product-disclaimer">
          Animated walkthrough · Sample feedback, not live AI processing
        </p>
      </section>
      <section className="product-scene product-comparison">
        <div className="product-scene-heading">
          <span>02 / FIND YOUR FIT</span>
          <h2>
            Same video.
            <br />
            Different possibilities.
          </h2>
          <p>Find where your idea is ready. See what needs another pass.</p>
        </div>
        <div className="demo-comparison">
          {report.platforms.map((p) => (
            <div
              className={`demo-platform-row demo-platform-${p.id}`}
              key={p.id}
            >
              <div>
                <PlatformIcon id={p.id} />
                <b>
                  {p.id === "instagram"
                    ? "Instagram Reels"
                    : p.id === "shorts"
                      ? "YouTube Shorts"
                      : p.id === "youtube"
                        ? "YouTube"
                        : "TikTok"}
                </b>
              </div>
              <div className="demo-score-track">
                <i style={{ width: `${p.score}%` }} />
              </div>
              <strong>
                {p.score}
                <small>/100</small>
              </strong>
              <span>
                {p.id === "shorts"
                  ? "STRONGEST FIT"
                  : p.id === "youtube"
                    ? "ADD MORE DEPTH"
                    : "READY FOR A TIGHTER EDIT"}
              </span>
            </div>
          ))}
        </div>
        <p className="product-disclaimer">
          Illustrative content-readiness scores · Not a prediction of views or
          virality
        </p>
      </section>
      <section className="product-scene product-optimization">
        <div className="product-scene-heading">
          <span>03 / KEEP YOUR VOICE. SHARPEN THE IDEA.</span>
          <h2>
            A stronger opening.
            <br />A better next edit.
          </h2>
        </div>
        <div className="before-after">
          <div className="copy-before">
            <span>BEFORE</span>
            <h3>
              “Check out
              <br />
              my new video!”
            </h3>
            <p>The idea is there. The reason to stay is missing.</p>
            <div className="edit-timeline">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <small>
              00:00 <span>A pause before the payoff</span> 00:24
            </small>
          </div>
          <div className="copy-after">
            <span>
              <Sparkles size={14} /> VIRALPILOT SUGGESTS
            </span>
            <h3>
              “You don’t need a perfect idea.
              <br />
              You need to start.”
            </h3>
            <p>
              <b>Title</b> Make something before you feel ready
            </p>
            <p>
              <b>Caption</b> Less overthinking. More making.
            </p>
            <p>
              <b>Next edit</b> Open on the result. Trim the first pause.
            </p>
            <div className="edit-timeline optimized">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        <p className="product-disclaimer">
          Authored example suggestions · Your creative judgment comes first
        </p>
      </section>
      <section className="product-scene product-unified">
        <div className="unified-heading">
          <span>ONE VIDEO. A CLEARER NEXT MOVE.</span>
          <h2>
            Make every
            <br />
            <em>post count.</em>
          </h2>
          <p>Your video, platform fit and next edit. Together at last.</p>
        </div>
        <div className="unified-report">
          <span>
            <ScanLine size={20} /> Your content, in focus
          </span>
          <div className="unified-scores">
            {report.platforms.map((p) => (
              <div key={p.id}>
                <PlatformIcon id={p.id} />
                <strong>{p.score}</strong>
                <small>
                  {p.id === "shorts"
                    ? "Shorts"
                    : p.id === "instagram"
                      ? "Reels"
                      : p.id === "youtube"
                        ? "YouTube"
                        : "TikTok"}
                </small>
              </div>
            ))}
          </div>
          <div className="unified-insight">
            <b>YOUR NEXT MOVE</b>
            <p>
              Lead with the payoff.
              <br />
              Give every cut a reason to stay.
            </p>
            <span>
              Explore the interactive example <ArrowUpRight size={16} />
            </span>
          </div>
        </div>
        <p className="product-disclaimer">
          Demo report · Illustrative insights
        </p>
      </section>
    </div>
  );
}
