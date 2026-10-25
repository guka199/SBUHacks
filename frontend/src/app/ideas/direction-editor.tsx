import { ChevronDown, Loader2, Save } from "lucide-react";
import { creatorPreferencesSchema, type CreatorPreferences } from "@/lib/ideas";
import styles from "./ideas.module.css";

export type DirectionDraft = Omit<
  CreatorPreferences,
  "filming_minutes" | "topics_to_avoid" | "goal" | "goal_details"
> & { filming_minutes: string; topics_to_avoid: string };

export function directionDraft(
  preferences: CreatorPreferences,
): DirectionDraft {
  return {
    style_notes: preferences.style_notes,
    audience_notes: preferences.audience_notes,
    filming_minutes: preferences.filming_minutes?.toString() ?? "",
    topics_to_avoid: preferences.topics_to_avoid.join("\n"),
  };
}

export function directionIsDirty(
  draft: DirectionDraft,
  saved: CreatorPreferences,
) {
  // Ignore legacy fields in an in-memory draft after a client refresh.
  const activeDraft = {
    style_notes: draft.style_notes,
    audience_notes: draft.audience_notes,
    filming_minutes: draft.filming_minutes,
    topics_to_avoid: draft.topics_to_avoid,
  };
  return JSON.stringify(activeDraft) !== JSON.stringify(directionDraft(saved));
}

export function parseDirection(draft: DirectionDraft) {
  const result = creatorPreferencesSchema.safeParse({
    ...draft,
    goal: null,
    goal_details: "",
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
  disabled,
  saving,
  onChange,
  onSave,
  onReset,
}: {
  draft: DirectionDraft;
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  onChange: (draft: DirectionDraft) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const validation = parseDirection(draft);
  const noteCount = [
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
    <div className={styles.direction}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <fieldset className={styles.directionFields} disabled={disabled}>
          <legend className={styles.srOnly}>Creator preferences</legend>
          <details
            className={styles.preferenceDetails}
            open={validation.error ? true : undefined}
          >
            <summary>
              <span>
                Customize
                {noteCount || draft.filming_minutes
                  ? " · preferences added"
                  : ""}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
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
            <div className={styles.advancedFields}>
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
        {dirty && (
          <div className={styles.directionActions}>
            <button
              className="text-link"
              type="submit"
              disabled={disabled || !!validation.error}
            >
              {saving ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Save size={16} />
              )}
              {saving ? "Saving…" : "Save preferences"}
            </button>
            <button
              className="text-link"
              type="button"
              onClick={onReset}
              disabled={disabled}
            >
              Discard changes
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
