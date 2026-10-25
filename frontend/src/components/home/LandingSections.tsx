import { PlatformIcon } from "../ui";
import styles from "./landing-sections.module.css";

const features = [
  [
    "Know what to change.",
    "Get feedback on your video or photo post, from the opening hook to the caption.",
  ],
  [
    "Choose the stronger thumbnail.",
    "Compare up to three options, with a recommendation for each video platform.",
  ],
  [
    "Find your next idea.",
    "Turn your channel history into follow-up ideas, with versions for different platforms.",
  ],
  [
    "Keep your work together.",
    "Connect your accounts and return to saved reports in your studio.",
  ],
];
const networks = [
  { id: "youtube", name: "YouTube", detail: "Long-form videos & Shorts" },
  { id: "instagram", name: "Instagram", detail: "Reels & photo posts" },
  { id: "tiktok", name: "TikTok", detail: "Short-form videos" },
  { id: "linkedin", name: "LinkedIn", detail: "Photo posts & content ideas" },
] as const;

export function LandingSections() {
  return (
    <div className={styles.sections}>
      <section
        id="features"
        className={styles.section}
        aria-labelledby="features-title"
      >
        <div className={styles.heading}>
          <h2 id="features-title">
            Make your
            <br />
            <span>next move.</span>
          </h2>
          <p>
            From a first draft to what comes next. A little direction at every
            step.
          </p>
        </div>
        <dl className={styles.features}>
          {features.map(([title, detail]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        id="platforms"
        className={styles.section}
        aria-labelledby="platforms-title"
      >
        <div className={styles.heading}>
          <h2 id="platforms-title">
            Your content.
            <br />
            <span>More places.</span>
          </h2>
          <p>
            Different formats. Different audiences. Feedback and ideas for the
            places you publish.
          </p>
        </div>
        <ul className={styles.platforms}>
          {networks.map((network) => (
            <li key={network.id}>
              <PlatformIcon id={network.id} size={24} />
              <div>
                <h3>{network.name}</h3>
                <p>{network.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
