import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { SERVICE_NAMES, formatDate, t } from "@/lib/i18n";
import { canSeeBooking, playbackUrl, refreshStreamStatus } from "@/lib/videos";
import Header from "../../../components/Header";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser(["client", "cleaner"], `/cuenta/videos/${id}`);
  const locale = await getLocale();
  const d = t(locale);
  const db = await getDb();
  const [row] = await db
    .select({ v: schema.videos, b: schema.bookings, p: schema.properties })
    .from(schema.videos)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.videos.bookingId))
    .innerJoin(schema.properties, eq(schema.properties.id, schema.bookings.propertyId))
    .where(eq(schema.videos.id, id));
  if (!row || !canSeeBooking(user, row.b)) notFound();
  const video = await refreshStreamStatus(row.v);
  const play = await playbackUrl(video);
  return (
    <>
      <Header locale={locale} path={`/cuenta/videos/${id}`} />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <p>
          <Link href={user.role === "admin" ? `/admin/trabajo/${row.b.id}` : "/cuenta"}>← {d.myAccount}</Link>
        </p>
        <h1>{formatDate(row.b.date, locale)}</h1>
        <p className="muted">
          {SERVICE_NAMES[row.b.service]?.[locale]} · {row.p.address}
          {row.p.unit ? `, ${row.p.unit}` : ""}
        </p>
        <div className="card">
          {video.status === "deleted" ? (
            <p className="muted">{d.videoDeleted}</p>
          ) : !play ? (
            <p className="muted">{d.videoProcessing}</p>
          ) : play.kind === "iframe" ? (
            <div className="video-frame">
              <iframe src={play.url} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Video" />
            </div>
          ) : (
            <div className="video-frame">
              <video src={play.url} controls playsInline preload="metadata" controlsList="nodownload" />
            </div>
          )}
          {video.status !== "deleted" && (
            <p className="muted small" style={{ marginTop: 12 }}>
              {d.videoExpires(formatDate(video.expiresAt.toISOString(), locale, { weekday: undefined }))}.{" "}
              {locale === "en" ? "Recorded without audio." : "Grabado sin audio."}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
