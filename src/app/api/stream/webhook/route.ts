import { NextResponse } from "next/server";
import { applyStreamState, verifyStreamWebhook } from "@/lib/videos";

// Cloudflare Stream avisa cuando un video terminó de procesarse.
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyStreamWebhook(body, req.headers.get("webhook-signature"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  const data = JSON.parse(body) as { uid?: string; readyToStream?: boolean; duration?: number; status?: { state?: string } };
  if (data.uid) {
    try {
      await applyStreamState(data.uid, data);
    } catch (e) {
      console.error("Webhook de Stream", e);
    }
  }
  return NextResponse.json({ ok: true });
}
