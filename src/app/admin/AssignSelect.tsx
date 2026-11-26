"use client";
import { useState, useTransition } from "react";
import { assignCleanerTo } from "./actions";

export default function AssignSelect({
  bookingId,
  current,
  cleaners,
}: {
  bookingId: string;
  current: string | null;
  cleaners: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <span className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
      <select
        aria-label="Limpiador"
        value={value}
        disabled={pending}
        style={{ minHeight: 36, padding: "4px 10px", maxWidth: 240 }}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setSaved(false);
          start(async () => {
            await assignCleanerTo(bookingId, v);
            setSaved(true);
          });
        }}
      >
        <option value="">Sin asignar</option>
        {cleaners.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span className="small muted" style={{ width: 20 }} aria-live="polite">
        {pending ? "…" : saved ? "✓" : ""}
      </span>
    </span>
  );
}
