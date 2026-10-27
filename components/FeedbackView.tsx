"use client";

import type { Feedback } from "@/lib/ai";

/** "What's good" and "What to watch (and why)" from the AI. */
export function FeedbackView({ feedback }: { feedback: Feedback }) {
  return (
    <div className="feedback">
      {feedback.good.length > 0 && (
        <div>
          <div className="fb-title good">What&apos;s good</div>
          <ul>
            {feedback.good.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {feedback.bad.length > 0 && (
        <div>
          <div className="fb-title bad">What to watch</div>
          <ul>
            {feedback.bad.map((b, i) => (
              <li key={i}>
                <b>{b.issue}</b>
                {b.cause && <span className="muted"> · from {b.cause.replace(/^(from|caused by)\s+/i, "")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
