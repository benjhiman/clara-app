import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Booking, User, Video } from "@/db/schema";
import { demo, env } from "./env";
import { VIDEO_RETENTION_DAYS } from "./schedule";
import { sendEmail } from "./email";
import { asLocale, formatDate, SERVICE_NAMES } from "./i18n";
import { getUser } from "./bookings";

export const LOCAL_VIDEO_DIR = path.join(process.cwd(), ".data", "videos");
const CF = () => `https://api.cloudflare.com/client/v4/accounts/${env.cfAccount}/stream`;
const cfHeaders = () => ({ Authorization: `Bearer ${env.cfStreamToken}` });

export function expiresAtFrom(d = new Date()) {
  return new Date(d.getTime() + VIDEO_RETENTION_DAYS * 86_400_000);
}

/** ¿Este usuario puede ver o subir videos de esta limpieza? */
export function canSeeBooking(user: User, b: Booking) {
  return user.role === "admin" || b.userId === user.id || b.cleanerId === user.id;
}
export function canUploadToBooking(user: User, b: Booking) {
  return user.role === "admin" || (user.role === "cleaner" && b.cleanerId === user.id);
}

function b64(s: string) {
  return Buffer.from(s).toString("base64");
}

/**
 * Crea una subida "tus" en Cloudflare Stream y devuelve la URL a la que el celular
 * del limpiador manda el archivo directamente (no pasa por nuestro servidor).
 */
export async function createStreamUpload(booking: Booking, uploader: User, uploadLength: number, filename: string) {
  const expires = expiresAtFrom();
  const meta = [
    `name ${b64(`${booking.date} ${booking.service} ${filename}`.slice(0, 200))}`,
    "requiresignedurls",
    `scheduleddeletion ${b64(expires.toISOString())}`,
    `maxdurationseconds ${b64(String(6 * 3600))}`,
  ].join(",");
  const res = await fetch(`${CF()}?direct_user=true`, {
    method: "POST",
    headers: {
      ...cfHeaders(),
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(uploadLength),
      "Upload-Metadata": meta,
    },
  });
  const location = res.headers.get("location");
  const mediaId = res.headers.get("stream-media-id");
  if (!res.ok || !location || !mediaId) {
    throw new Error(`Cloudflare Stream no aceptó la subida (${res.status}): ${await res.text()}`);
  }
  const db = await getDb();
  const [video] = await db
    .insert(schema.videos)
    .values({
      bookingId: booking.id,
      uploadedBy: uploader.id,
      provider: "stream",
      providerId: mediaId,
      status: "uploading",
      sizeBytes: uploadLength,
      expiresAt: expires,
    })
    .returning();
  return { location, video };
}

export async function createLocalUpload(booking: Booking, uploader: User, size: number, sample = false) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const [video] = await db
    .insert(schema.videos)
    .values({
      id,
      bookingId: booking.id,
      uploadedBy: uploader.id,
      provider: sample ? "sample" : "local",
      providerId: sample ? "demo" : id,
      status: "uploading",
      sizeBytes: size,
      expiresAt: expiresAtFrom(),
    })
    .returning();
  return video;
}

/** El limpiador avisa que terminó de subir. Con Stream queda "procesando" hasta el webhook. */
export async function markUploaded(video: Video) {
  const db = await getDb();
  if (video.provider === "local" || video.provider === "sample") {
    await db.update(schema.videos).set({ status: "ready" }).where(eq(schema.videos.id, video.id));
    await notifyVideoReady(video.id);
    return;
  }
  await db.update(schema.videos).set({ status: "processing" }).where(eq(schema.videos.id, video.id));
  await refreshStreamStatus({ ...video, status: "processing" });
}

/** Consulta a Cloudflare si el video ya está listo (por si el webhook no llegó). */
export async function refreshStreamStatus(video: Video): Promise<Video> {
  if (video.provider !== "stream" || !["uploading", "processing"].includes(video.status) || demo.video) return video;
  const res = await fetch(`${CF()}/${video.providerId}`, { headers: cfHeaders() });
  if (!res.ok) return video;
  const data = (await res.json()) as { result?: { readyToStream?: boolean; duration?: number; status?: { state?: string } } };
  return applyStreamState(video.providerId, data.result ?? {});
}

export async function applyStreamState(
  mediaId: string,
  r: { readyToStream?: boolean; duration?: number; status?: { state?: string } },
): Promise<Video> {
  const db = await getDb();
  const [video] = await db.select().from(schema.videos).where(eq(schema.videos.providerId, mediaId));
  if (!video) throw new Error("Video no encontrado");
  if (video.status === "deleted") return video;
  let status = video.status;
  if (r.readyToStream) status = "ready";
  else if (r.status?.state === "error") status = "error";
  else if (r.status?.state && r.status.state !== "pendingupload") status = "processing";
  const [updated] = await db
    .update(schema.videos)
    .set({ status, durationSeconds: r.duration && r.duration > 0 ? Math.round(r.duration) : video.durationSeconds })
    .where(eq(schema.videos.id, video.id))
    .returning();
  if (status === "ready") await notifyVideoReady(video.id);
  return updated;
}

export function verifyStreamWebhook(body: string, header: string | null): boolean {
  if (!env.cfWebhookSecret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  if (!parts.time || !parts.sig1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.time)) > 600) return false;
  const expected = crypto.createHmac("sha256", env.cfWebhookSecret).update(`${parts.time}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.sig1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** URL para ver el video (firmada, vence en 2 horas). */
export async function playbackUrl(video: Video): Promise<{ kind: "iframe" | "file"; url: string } | null> {
  if (video.status !== "ready") return null;
  if (video.provider === "local") return { kind: "file", url: `/api/videos/${video.id}/archivo` };
  if (video.provider === "sample") return { kind: "file", url: "/demo-video.mp4" };
  const res = await fetch(`${CF()}/${video.providerId}/token`, {
    method: "POST",
    headers: { ...cfHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 2 * 3600, downloadable: false }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: { token?: string } };
  const token = data.result?.token;
  if (!token) return null;
  return { kind: "iframe", url: `https://customer-${env.cfCustomerCode}.cloudflarestream.com/${token}/iframe` };
}

async function notifyVideoReady(videoId: string) {
  const db = await getDb();
  const [video] = await db
    .update(schema.videos)
    .set({ notifiedAt: new Date() })
    .where(and(eq(schema.videos.id, videoId), isNull(schema.videos.notifiedAt)))
    .returning();
  if (!video) return;
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, video.bookingId));
  const user = await getUser(b.userId);
  const lang = asLocale(user.locale);
  await sendEmail({
    to: user.email,
    subject: lang === "en" ? "Your cleaning video is ready" : "Ya está el video de tu limpieza",
    heading: lang === "en" ? "Clean you can see" : "Clean you can see",
    paragraphs: [
      `${SERVICE_NAMES[b.service][lang]} · ${formatDate(b.date, lang)}`,
      lang === "en"
        ? `The video will be available until ${formatDate(video.expiresAt.toISOString(), lang)}.`
        : `El video va a estar disponible hasta el ${formatDate(video.expiresAt.toISOString(), lang)}.`,
    ],
    button: { label: lang === "en" ? "Watch video" : "Ver video", url: `${env.appUrl}/cuenta/videos/${video.id}` },
  });
}

/** Borra los videos que pasaron los 30 días (Cloudflare también los borra solo, esto es el respaldo). */
export async function deleteExpiredVideos() {
  const db = await getDb();
  const expired = await db
    .select()
    .from(schema.videos)
    .where(and(lt(schema.videos.expiresAt, new Date()), ne(schema.videos.status, "deleted")));
  for (const v of expired) await deleteVideo(v);
  return expired.length;
}

export async function deleteVideo(v: Video) {
  const db = await getDb();
  if (v.provider === "stream" && !demo.video) {
    const res = await fetch(`${CF()}/${v.providerId}`, { method: "DELETE", headers: cfHeaders() });
    if (!res.ok && res.status !== 404) {
      console.error("No se pudo borrar el video en Cloudflare", v.id, res.status);
      return;
    }
  } else if (v.provider === "local") {
    await fs.rm(path.join(LOCAL_VIDEO_DIR, `${v.id}.mp4`), { force: true });
  }
  await db.update(schema.videos).set({ status: "deleted", deletedAt: new Date() }).where(eq(schema.videos.id, v.id));
}
