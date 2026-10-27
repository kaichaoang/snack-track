"use client";

import { useEffect, useState } from "react";

/** ✕ button that needs a second tap ("Delete?") within 4 seconds. */
export function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return armed ? (
    <button className="confirm-delete" aria-label={`Confirm delete ${label}`} onClick={onConfirm}>
      Delete?
    </button>
  ) : (
    <button className="ghost danger" aria-label={`Delete ${label}`} onClick={() => setArmed(true)}>
      ✕
    </button>
  );
}
