import { NextResponse } from "next/server";
import { demo, env } from "@/lib/env";
import { extendAllSubscriptions, sendReminders } from "@/lib/bookings";
import { deleteExpiredVideos } from "@/lib/videos";

// Vercel lo llama todos los días (ver vercel.json). Arma las visitas de los planes,
// manda los recordatorios de mañana y borra los videos de más de 30 días.
export async function GET(req: Request) {
  if (env.cronSecret && req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  if (!env.cronSecret && env.isProd && !demo.public) return NextResponse.json({ error: "falta CRON_SECRET" }, { status: 500 });
  const plans = await extendAllSubscriptions();
  const reminders = await sendReminders();
  const deleted = await deleteExpiredVideos();
  return NextResponse.json({ plans, reminders, deleted });
}
