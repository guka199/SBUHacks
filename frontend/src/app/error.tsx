"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Something interrupted the session.</h1>
      <p>Your original video file is safe. Try opening this page again.</p>
      <button className="button button-accent" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
