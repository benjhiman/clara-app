import "server-only";
import { env, demo } from "./env";

export type Email = { to: string; subject: string; heading: string; paragraphs: string[]; button?: { label: string; url: string } };

export const devOutbox: { at: string; to: string; subject: string; text: string }[] = [];

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderEmail(e: Email) {
  const btn = e.button
    ? `<p style="margin:28px 0"><a href="${escape(e.button.url)}" style="background:#0B6E8A;color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:999px;display:inline-block">${escape(e.button.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F4F6F8;font-family:Inter,Arial,sans-serif;color:#12212B">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<img src="${env.appUrl}/logo.png" alt="Clara" width="120" style="display:block;margin-bottom:24px">
<div style="background:#fff;border-radius:16px;padding:32px">
<h1 style="font-family:Sora,Arial,sans-serif;font-size:22px;margin:0 0 16px">${escape(e.heading)}</h1>
${e.paragraphs.map((p) => `<p style="font-size:16px;line-height:1.55;margin:0 0 12px">${escape(p)}</p>`).join("")}
${btn}
</div>
<p style="font-size:12px;color:#4A5568;margin-top:20px">Clara Professional Cleaning Services · Miami, FL · Clean you can see.</p>
</div></body></html>`;
  const text = [e.heading, "", ...e.paragraphs, ...(e.button ? ["", `${e.button.label}: ${e.button.url}`] : [])].join("\n");
  return { html, text };
}

export async function sendEmail(e: Email): Promise<void> {
  const { html, text } = renderEmail(e);
  if (demo.email) {
    devOutbox.unshift({ at: new Date().toISOString(), to: e.to, subject: e.subject, text });
    devOutbox.splice(50);
    console.log(`\n[email demo] Para: ${e.to}\nAsunto: ${e.subject}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [e.to], subject: e.subject, html, text }),
  });
  if (!res.ok) console.error("Error enviando email", res.status, await res.text());
}
