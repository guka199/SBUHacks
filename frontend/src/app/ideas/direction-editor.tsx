import {
  Check,
  ChevronDown,
  Compass,
  Loader2,
  MessageCircle,
  PanelsTopLeft,
  Save,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import {
  creatorPreferencesSchema,
  localDate,
  type CreatorPreferences,
} from "@/lib/ideas";
import styles from "./ideas.module.css";

export type DirectionDraft = Omit<
  CreatorPreferences,
  "filming_minutes" | "topics_to_avoid"
> & { filming_minutes: string; topics_to_avoid: string };

export function directionDraft(
  preferences: CreatorPreferences,
): DirectionDraft {
  return {
    ...preferences,
    filming_minutes: preferences.filming_minutes?.toString() ?? "",
    topics_to_avoid: preferences.topics_to_avoid.join("\n"),
  };
}

export function directionIsDirty(
  draft: DirectionDraft,
  saved: CreatorPreferences,
) {
  return JSON.stringify(draft) !== JSON.stringify(directionDraft(saved));
}

export function parseDirection(draft: DirectionDraft) {
  const result = creatorPreferencesSchema.safeParse({
    ...draft,
    goal_details: draft.goal_details.trim(),
    filming_minutes: draft.filming_minutes.trim()
      ? Number(draft.filming_minutes)
      : null,
    style_notes: draft.style_notes.trim(),
    audience_notes: draft.audience_notes.trim(),
    topics_to_avoid: draft.topics_to_avoid
      .split("\n")
      .map((topic) => topic.trim())
      .filter(Boolean),
  });
  if (result.success) return { preferences: result.data, error: "" };
  const field = result.error.issues[0]?.path[0];
  const error =
    field === "filming_minutes"
      ? "Use a whole number from 5 to 480 minutes, or leave the time blank."
      : field === "topics_to_avoid"
        ? "Add up to 10 topics to avoid, one per line, with 100 characters at most per topic."
        : "Keep each note within 500 characters.";
  return { preferences: null, error };
}

const goalChoices = [
  {
    value: null,
    title: "Explore",
    description: "Find a fresh angle",
    icon: Compass,
  },
  {
    value: "growth",
    title: "Grow",
    description: "Reach new people",
    icon: TrendingUp,
  },
  {
    value: "engagement",
    title: "Engage",
    description: "Start conversations",
    icon: MessageCircle,
  },
  {
    value: "sales",
    title: "Sell",
    description: "Support your offer",
    icon: ShoppingBag,
  },
  {
    value: "series",
    title: "Build a series",
    description: "Keep a story going",
    icon: PanelsTopLeft,
  },
] as const;

export function DirectionEditor({
  draft,
  dirty,
  updatedAt,
  disabled,
  saving,
  onChange,
  onSave,
  onReset,
}: {
  draft: DirectionDraft;
  dirty: boolean;
  updatedAt: string | null;
  disabled: boolean;
  saving: boolean;
  onChange: (draft: DirectionDraft) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const validation = parseDirection(draft);
  const noteCount = [
    draft.goal_details,
    draft.style_notes,
    draft.audience_notes,
    draft.topics_to_avoid,
  ].filter((note) => note.trim()).length;
  function change<K extends keyof DirectionDraft>(
    key: K,
    value: DirectionDraft[K],
  ) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <section className={styles.direction} aria-labelledby="direction-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>01 / Make it yours</span>
          <h2 id="direction-heading">What do you want your next post to do?</h2>
        </div>
        <span className={styles.badge}>
          {dirty
            ? "Unsaved changes"
            : updatedAt
              ? "Preferences saved"
              : "Optional"}
        </span>
      </div>
      <p className={styles.subtle}>
        Pick a goal, or explore freely. Everything here is optional and can be
        changed later.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset className={styles.directionFields} disabled={disabled}>
          <legend className={styles.srOnly}>Creator preferences</legend>
          <div
            className={styles.goalOptions}
            role="group"
            aria-label="Your main goal"
          >
            {goalChoices.map(({ value, title, description, icon: Icon }) => (
              <label className={styles.goalOption} key={value ?? "explore"}>
                <input
                  type="radio"
                  name="creator-goal"
                  aria-label={`${title}: ${description}`}
                  value={value ?? ""}
                  checked={draft.goal === value}
                  onChange={() => change("goal", value)}
                />
                <span className={styles.goalContent}>
                  <span className={styles.goalIcon}>
                    <Icon size={19} aria-hidden="true" />
                    {draft.goal === value && (
                      <Check size={14} aria-hidden="true" />
                    )}
                  </span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          <div className={styles.fullWidth}>
            <label htmlFor="filming-minutes">
              How much time can you spend filming?{" "}
              <span className={styles.optional}>Optional</span>
            </label>
            <div className={styles.filmingControls}>
              <div
                className={styles.timePresets}
                role="group"
                aria-label="Quick filming time choices"
              >
                {["", "15", "30", "60"].map((minutes) => (
                  <button
                    key={minutes || "flexible"}
                    type="button"
                    aria-pressed={draft.filming_minutes === minutes}
                    onClick={() => change("filming_minutes", minutes)}
                  >
                    {minutes ? `${minutes} min` : "Flexible"}
                  </button>
                ))}
              </div>
              <span className={styles.timeInput}>
                <input
                  id="filming-minutes"
                  type="number"
                  min={5}
                  max={480}
                  step={1}
                  value={draft.filming_minutes}
                  placeholder="Custom"
                  onChange={(event) =>
                    change("filming_minutes", event.target.value)
                  }
                />
                <span>min</span>
              </span>
            </div>
            <p className={styles.fieldHint}>
              Time to make one idea, not the length of the video.
            </p>
          </div>
          <details className={styles.preferenceDetails}>
            <summary>
              <span>
                {noteCount
                  ? `Style, audience & other preferences · ${noteCount} added`
                  : "Add your style, audience, or topics to avoid"}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p className={styles.fieldHint}>
              Your notes take priority over patterns inferred from your history.
            </p>
            <div className={styles.advancedFields}>
              <label className={styles.fullWidth}>
                What would success look like?{" "}
                <span className={styles.optional}>Optional</span>
                <textarea
                  value={draft.goal_details}
                  rows={2}
                  maxLength={500}
                  placeholder={
                    draft.goal === "sales"
                      ? "What product or service do you offer, and who does it help?"
                      : "For example, reach beginners with a weekly practice series."
                  }
                  onChange={(event) =>
                    change("goal_details", event.target.value)
                  }
                />
              </label>
              <label>
                Your style
                <textarea
                  value={draft.style_notes}
                  rows={3}
                  maxLength={500}
                  placeholder="Tone, language, presentation, or corrections to the inferred style."
                  onChange={(event) =>
                    change("style_notes", event.target.value)
                  }
                />
              </label>
              <label>
                Who are you creating for?
                <textarea
                  value={draft.audience_notes}
                  rows={3}
                  maxLength={500}
                  placeholder="Your intended audience, their interests, or corrections to saved audience details."
                  onChange={(event) =>
                    change("audience_notes", event.target.value)
                  }
                />
              </label>
              <label className={styles.fullWidth}>
                Topics to avoid{" "}
                <span className={styles.optional}>
                  Optional · one per line, up to 10
                </span>
                <textarea
                  value={draft.topics_to_avoid}
                  rows={2}
                  maxLength={1100}
                  placeholder="Topics you do not want suggested."
                  onChange={(event) =>
                    change("topics_to_avoid", event.target.value)
                  }
                />
              </label>
            </div>
          </details>
        </fieldset>
        {dirty && validation.error && (
          <p className="error-message" role="alert">
            {validation.error}
          </p>
        )}
        <div className={styles.directionActions}>
          <button
            className="button button-light"
            type="submit"
            disabled={disabled || !dirty || !!validation.error}
          >
            {saving ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Save size={16} />
            )}
            {saving ? "Saving…" : "Save preferences"}
          </button>
          {dirty ? (
            <>
              <button
                className="text-link"
                type="button"
                onClick={onReset}
                disabled={disabled}
              >
                Discard changes
              </button>
              <p className={styles.subtle}>
                Generate ideas to save and use these changes in one step.
              </p>
            </>
          ) : (
            <p className={styles.subtle}>
              {updatedAt
                ? `Last saved ${localDate(updatedAt)}.`
                : "Happy to explore? Skip ahead and generate ideas."}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
