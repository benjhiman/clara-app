// Zonas, horarios y armado del calendario de visitas. Sin dependencias de servidor.
import type { PlanService, Service } from "./pricing";

export const TIMEZONE = "America/New_York";

// Códigos postales que atiende Clara. Agregá o sacá ZIPs acá.
export const ZONES: Record<string, string[]> = {
  Brickell: ["33129", "33130", "33131"],
  Downtown: ["33128", "33132", "33136"],
  Edgewater: ["33137"],
  "Miami Beach": ["33109", "33139", "33140", "33141"],
  Doral: ["33122", "33126", "33166", "33172", "33178"],
};

export function zoneForZip(zip: string): string | null {
  const z = zip.trim().slice(0, 5);
  for (const [zone, zips] of Object.entries(ZONES)) if (zips.includes(z)) return zone;
  return null;
}

export const TIME_SLOTS = {
  morning: { es: "Mañana (8 a 12 h)", en: "Morning (8 am–12 pm)" },
  afternoon: { es: "Tarde (12 a 16 h)", en: "Afternoon (12–4 pm)" },
} as const;
export type TimeSlot = keyof typeof TIME_SLOTS;
export function isTimeSlot(s: string): s is TimeSlot {
  return s in TIME_SLOTS;
}

export const MAX_DAYS_AHEAD = 60;
export const SUBSCRIPTION_HORIZON_DAYS = 56;
export const VIDEO_RETENTION_DAYS = 30;
export const CANCEL_NOTICE_HOURS = 24;

/** Fecha de hoy en Miami, YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
}

/** Primer día que se puede reservar para un servicio. */
export function earliestDate(service: Service, extras: string[] = [], now = new Date()): string {
  const today = todayISO(now);
  if (service === "host") return extras.includes("same_day") ? today : addDays(today, 1);
  return addDays(today, 2);
}

export function validateDate(
  service: Service,
  date: string,
  extras: string[] = [],
  now = new Date(),
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "invalid_date";
  const earliest = earliestDate(service, extras, now);
  if (date < earliest) return "too_soon";
  if (daysBetween(todayISO(now), date) > MAX_DAYS_AHEAD) return "too_far";
  // Domingos solo turnovers de Airbnb
  if (service !== "host" && weekdayOf(date) === 0) return "sunday";
  return null;
}

export type PlannedVisit = { date: string; service: "essential" | "plus" | "plus_deep" };

/**
 * Visitas de un plan entre `from` y `through` (inclusive).
 * Essential: cada 14 días desde la fecha de inicio.
 * Plus: semanal; una de cada 4 visitas (empezando por la primera) es la limpieza profunda.
 */
export function planVisits(
  plan: PlanService,
  startDate: string,
  from: string,
  through: string,
): PlannedVisit[] {
  const step = plan === "essential" ? 14 : 7;
  const out: PlannedVisit[] = [];
  let d = startDate;
  let i = 0;
  while (d < from) {
    d = addDays(d, step);
    i++;
  }
  for (; d <= through; d = addDays(d, step), i++) {
    if (plan === "essential") out.push({ date: d, service: "essential" });
    // Plus: 4 visitas por ciclo; la primera de cada ciclo es la limpieza profunda.
    else out.push({ date: d, service: i % 4 === 0 ? "plus_deep" : "plus" });
  }
  return out;
}

/** Hora de inicio aproximada de una franja, para calcular avisos de cancelación. */
export function slotStart(date: string, slot: string): Date {
  const hour = slot === "afternoon" ? 12 : 8;
  // Miami es UTC-5 (invierno) o UTC-4 (verano). Usamos el offset real de ese día.
  const probe = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const offsetMs = probe.getTime() - local.getTime();
  return new Date(probe.getTime() + offsetMs);
}

export function canCustomerCancel(date: string, slot: string, now = new Date()): boolean {
  return slotStart(date, slot).getTime() - now.getTime() >= CANCEL_NOTICE_HOURS * 3_600_000;
}
