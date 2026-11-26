"use client";
import { useActionState } from "react";
import { requestLink, type LoginState } from "./actions";
import type { Dict } from "@/lib/i18n";

export default function LoginForm({ next, labels }: { next: string; labels: Pick<Dict, "email" | "sendLink" | "linkSent"> & { errEmail: string } }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLink, {});
  if (state.sent)
    return (
      <div className="notice">
        <p>{labels.linkSent}</p>
        {state.devLink && (
          <p className="small">
            Modo demo: <a href={state.devLink}>entrar con este link</a>
          </p>
        )}
      </div>
    );
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        {state.error && <p className="error">{labels.errEmail}</p>}
      </div>
      <button className="btn block" disabled={pending}>
        {labels.sendLink}
      </button>
    </form>
  );
}
