import { Loader2, Save } from "lucide-react";
import {
  creatorGoals,
  creatorPreferencesSchema,
  goalNames,
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
          <span className={styles.eyebrow}>You set the direction</span>
          <h2 id="direction-heading">What are you working toward?</h2>
        </div>
        <span className={styles.badge}>
          {dirty
            ? "Unsaved changes"
            : updatedAt
              ? "Saved to your account"
              : "Optional"}
        </span>
      </div>
      <p className={styles.subtle}>
        These preferences apply across platforms. Your notes take priority over
        inferred style and audience details in channel memory.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset className={styles.directionFields} disabled={disabled}>
          <legend className={styles.srOnly}>Creator preferences</legend>
          <label>
            Main goal
            <select
              value={draft.goal ?? ""}
              onChange={(event) =>
                change(
                  "goal",
                  (event.target.value as CreatorPreferences["goal"]) || null,
                )
              }
            >
              <option value="">Explore ideas without a specific goal</option>
              {creatorGoals.map((goal) => (
                <option key={goal} value={goal}>
                  {goalNames[goal]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time available to film one idea
            <span className={styles.timeInput}>
              <input
                type="number"
                min={5}
                max={480}
                step={1}
                value={draft.filming_minutes}
                placeholder="Not specified"
                onChange={(event) =>
                  change("filming_minutes", event.target.value)
                }
              />
              <span>minutes</span>
            </span>
          </label>
          <label className={styles.fullWidth}>
            What would success look like?{" "}
            <span className={styles.optional}>Optional</span>
            <textarea
              value={draft.goal_details}
              rows={2}
              maxLength={500}
              placeholder="For example, reach beginner pianists with a weekly practice series."
              onChange={(event) => change("goal_details", event.target.value)}
            />
          </label>
          <label>
            Your style
            <textarea
              value={draft.style_notes}
              rows={3}
              maxLength={500}
              placeholder="Tone, language, presentation, or corrections to the inferred style."
              onChange={(event) => change("style_notes", event.target.value)}
            />
          </label>
          <label>
            Who are you creating for?
            <textarea
              value={draft.audience_notes}
              rows={3}
              maxLength={500}
              placeholder="Your intended audience, their interests, or corrections to saved audience details."
              onChange={(event) => change("audience_notes", event.target.value)}
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
            {saving ? "Saving direction…" : "Save direction"}
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
                Save your changes before generating ideas or refreshing memory.
              </p>
            </>
          ) : (
            <p className={styles.subtle}>
              {updatedAt
                ? `Last saved ${localDate(updatedAt)}.`
                : "You can generate ideas without choosing a goal."}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
