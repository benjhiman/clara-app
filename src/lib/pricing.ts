// Precios de Clara (de Clara_Precios.xlsx, borrador v1). Todo en dólares.
// Para cambiar un precio, cambialo acá y se actualiza en toda la app.

export type Bedrooms = 1 | 2 | 3 | 4;
export type OneTimeService = "single" | "deep" | "move";
export type PlanService = "essential" | "plus";
export type Service = OneTimeService | PlanService | "host";

export const BEDROOMS: Bedrooms[] = [1, 2, 3, 4];

export const PRICES: Record<Service, Partial<Record<Bedrooms, number>>> = {
  single: { 1: 175, 2: 235, 3: 299, 4: 379 },
  deep: { 1: 279, 2: 355, 3: 455, 4: 585 },
  move: { 1: 329, 2: 419, 3: 539, 4: 689 },
  // Por mes (Essential = 2 visitas, Plus = 3 semanales + 1 profunda)
  essential: { 1: 278, 2: 370, 3: 470, 4: 590 },
  plus: { 1: 595, 2: 795, 3: 1015, 4: 1295 },
  // Por turnover (Host no llega a 4 hab)
  host: { 1: 119, 2: 155, 3: 199 },
};

export type ExtraId = "extra_bath" | "same_day" | "oven" | "fridge";

export const EXTRAS: Record<ExtraId, { price: number; services: Service[] }> = {
  extra_bath: { price: 25, services: ["single", "deep", "move", "essential", "plus", "host"] },
  same_day: { price: 25, services: ["host"] },
  oven: { price: 35, services: ["single", "deep", "move", "essential", "plus"] },
  fridge: { price: 35, services: ["single", "deep", "move", "essential", "plus"] },
};

// Ofertas de lanzamiento
export const LAUNCH = {
  firstMonthPlanDiscount: 0.25, // Essential y Plus: 25% el primer mes
  hostFirstTurnoverDiscount: 0.5, // Clara Host: primer turnover al 50%
};

export function isService(s: string): s is Service {
  return s in PRICES;
}

export function isPlan(s: Service): s is PlanService {
  return s === "essential" || s === "plus";
}

export function availableBedrooms(service: Service): Bedrooms[] {
  return BEDROOMS.filter((b) => PRICES[service][b] !== undefined);
}

export function extrasFor(service: Service): ExtraId[] {
  return (Object.keys(EXTRAS) as ExtraId[]).filter((id) => EXTRAS[id].services.includes(service));
}

export type Quote = {
  base: number;
  extras: { id: ExtraId; price: number }[];
  /** Total antes de descuentos. Para planes es el precio mensual normal. */
  subtotal: number;
  discount: number;
  /** Lo que se cobra hoy (o en el primer cobro). */
  dueNow: number;
  /** Para planes: lo que se cobra desde el segundo mes. */
  recurring?: number;
};

export class PricingError extends Error {}

export function quote(
  service: Service,
  bedrooms: number,
  extras: string[] = [],
  opts: { hostIntro?: boolean; launchOffer?: boolean } = {},
): Quote {
  const base = PRICES[service][bedrooms as Bedrooms];
  if (base === undefined) throw new PricingError("Tamaño no disponible para este servicio");
  const allowed = extrasFor(service);
  const unique = Array.from(new Set(extras));
  const ex = unique.map((id) => {
    if (!allowed.includes(id as ExtraId)) throw new PricingError(`Extra no válido: ${id}`);
    const price = EXTRAS[id as ExtraId].price;
    // En planes, los extras se aplican en cada visita del mes.
    const perMonth = service === "essential" ? price * 2 : service === "plus" ? price * 4 : price;
    return { id: id as ExtraId, price: perMonth };
  });
  const subtotal = base + ex.reduce((s, e) => s + e.price, 0);
  let discount = 0;
  const launch = opts.launchOffer ?? true;
  if (launch && isPlan(service)) discount = round2(subtotal * LAUNCH.firstMonthPlanDiscount);
  if (launch && service === "host" && opts.hostIntro) discount = round2(subtotal * LAUNCH.hostFirstTurnoverDiscount);
  const dueNow = round2(subtotal - discount);
  return isPlan(service)
    ? { base, extras: ex, subtotal, discount, dueNow, recurring: subtotal }
    : { base, extras: ex, subtotal, discount, dueNow };
}

export function toCents(usd: number) {
  return Math.round(usd * 100);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatUSD(cents: number) {
  const usd = cents / 100;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(usd) ? 0 : 2,
  });
}
