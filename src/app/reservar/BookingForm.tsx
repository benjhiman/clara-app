"use client";
import { useMemo, useState, useTransition } from "react";
import {
  PRICES,
  availableBedrooms,
  extrasFor,
  formatUSD,
  isPlan,
  quote,
  toCents,
  type Service,
} from "@/lib/pricing";
import { TIME_SLOTS, earliestDate, validateDate, zoneForZip, type TimeSlot } from "@/lib/schedule";
import { EXTRA_NAMES, SERVICE_DESC, SERVICE_NAMES, t, type Locale } from "@/lib/i18n";
import { createBookingAction } from "./actions";

const SERVICES: Service[] = ["essential", "plus", "host", "single", "deep", "move"];

export type Prefill = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  unit?: string;
  zip?: string;
  accessNotes?: string;
  hostIntroAvailable: boolean;
};

export default function BookingForm({
  locale,
  prefill,
  initialService,
}: {
  locale: Locale;
  prefill: Prefill;
  initialService?: Service;
}) {
  const d = t(locale);
  const [step, setStep] = useState(initialService ? 1 : 0);
  const [service, setService] = useState<Service>(initialService ?? "essential");
  const [bedrooms, setBedrooms] = useState(2);
  const [extras, setExtras] = useState<string[]>([]);
  const [address, setAddress] = useState(prefill.address ?? "");
  const [unit, setUnit] = useState(prefill.unit ?? "");
  const [zip, setZip] = useState(prefill.zip ?? "");
  const [accessNotes, setAccessNotes] = useState(prefill.accessNotes ?? "");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<TimeSlot>("morning");
  const [name, setName] = useState(prefill.name ?? "");
  const [email, setEmail] = useState(prefill.email ?? "");
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sizes = availableBedrooms(service);
  const beds = sizes.includes(bedrooms as 1) ? bedrooms : sizes[sizes.length - 1];
  const allowedExtras = extrasFor(service);
  const chosenExtras = extras.filter((e) => allowedExtras.includes(e as never));
  const q = useMemo(
    () => quote(service, beds, chosenExtras, { hostIntro: prefill.hostIntroAvailable }),
    [service, beds, chosenExtras, prefill.hostIntroAvailable],
  );
  const zone = zip.trim().length >= 5 ? zoneForZip(zip) : null;
  const minDate = earliestDate(service, chosenExtras);

  function next() {
    setError(null);
    if (step === 2) {
      if (!address.trim()) return setError(d.errors.required);
      if (!zone) return setError(d.zipNotServed);
    }
    if (step === 3) {
      const err = validateDate(service, date, chosenExtras);
      if (err) return setError(d.errors[err as keyof typeof d.errors] ?? d.errors.generic);
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    setError(null);
    if (!name.trim() || !phone.trim()) return setError(d.errors.required);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(d.errors.email);
    if (!consent) return setError(d.errors.consent);
    startTransition(async () => {
      const res = await createBookingAction({
        service,
        bedrooms: beds,
        extras: chosenExtras,
        address,
        unit,
        zip,
        accessNotes,
        date,
        timeSlot: slot,
        name,
        email,
        phone,
        notes,
        locale,
      });
      if ("url" in res) window.location.href = res.url;
      else setError(d.errors[res.error as keyof typeof d.errors] ?? (res.error === "zip" ? d.zipNotServed : d.errors.generic));
    });
  }

  const priceSuffix = isPlan(service) ? ` ${d.perMonth}` : service === "host" ? ` ${d.perTurnover}` : "";

  return (
    <div className="card">
      <div className="steps" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>

      {step === 0 && (
        <>
          <h2>{d.stepService}</h2>
          <div className="options">
            {SERVICES.map((s) => {
              const min = Math.min(...Object.values(PRICES[s]).filter((x): x is number => x !== undefined));
              return (
                <button
                  key={s}
                  type="button"
                  className={`option ${service === s ? "on" : ""}`}
                  onClick={() => {
                    setService(s);
                    setStep(1);
                  }}
                >
                  <strong>{SERVICE_NAMES[s][locale]}</strong>
                  <span className="muted small">{SERVICE_DESC[s][locale]}</span>
                  <div className="price">
                    {locale === "en" ? "from" : "desde"} {formatUSD(min * 100)}
                    {isPlan(s) ? `/${locale === "en" ? "mo" : "mes"}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2>{SERVICE_NAMES[service][locale]}</h2>
          <p className="muted">{SERVICE_DESC[service][locale]}</p>
          <div className="field">
            <label>{d.bedrooms}</label>
            <div className="pills">
              {sizes.map((b) => (
                <button key={b} type="button" className={`pill ${beds === b ? "on" : ""}`} onClick={() => setBedrooms(b)}>
                  {b} · {formatUSD((PRICES[service][b] ?? 0) * 100)}
                </button>
              ))}
            </div>
            {service !== "host" && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {locale === "en" ? "Larger than 4 bedrooms? Contact us for a quote." : "¿Más de 4 habitaciones? Escribinos y te cotizamos."}
              </p>
            )}
          </div>
          {allowedExtras.length > 0 && (
            <div className="field">
              <label>{d.extras}</label>
              <div className="stack">
                {allowedExtras.map((id) => {
                  const one = quote(service, beds, [id], { launchOffer: false }).extras[0];
                  return (
                    <label key={id} className="check">
                      <input
                        type="checkbox"
                        checked={chosenExtras.includes(id)}
                        onChange={(e) => setExtras((xs) => (e.target.checked ? [...xs, id] : xs.filter((x) => x !== id)))}
                      />
                      <span>
                        {EXTRA_NAMES[id][locale]} · +{formatUSD(toCents(one.price))}
                        {isPlan(service) ? ` ${d.perMonth}` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h2>{d.stepAddress}</h2>
          <div className="field">
            <label htmlFor="address">{d.address}</label>
            <input id="address" type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="unit">{d.unit}</label>
              <input id="unit" type="text" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="zip">{d.zip}</label>
              <input id="zip" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={zip} onChange={(e) => setZip(e.target.value)} />
              {zip.trim().length >= 5 && (zone ? <p className="small muted" style={{ marginTop: 6 }}>✓ {zone}</p> : <p className="error">{d.zipNotServed}</p>)}
            </div>
          </div>
          <div className="field">
            <label htmlFor="access">{d.access}</label>
            <textarea id="access" value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h2>{d.stepWhen}</h2>
          <div className="field">
            <label htmlFor="date">{isPlan(service) ? d.firstVisit : d.date}</label>
            <input id="date" type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
            {isPlan(service) && <p className="muted small" style={{ marginTop: 6 }}>{d.repeatsEvery(service)}</p>}
          </div>
          <div className="field">
            <label>{d.slot}</label>
            <div className="pills">
              {(Object.keys(TIME_SLOTS) as TimeSlot[]).map((s) => (
                <button key={s} type="button" className={`pill ${slot === s ? "on" : ""}`} onClick={() => setSlot(s)}>
                  {TIME_SLOTS[s][locale]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h2>{d.stepContact}</h2>
          <div className="grid2">
            <div className="field">
              <label htmlFor="name">{d.name}</label>
              <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="phone">{d.phone}</label>
              <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">{d.email}</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="notes">{d.notes}</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="check field">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{d.consent}</span>
          </label>

          <div className="card flat">
            <h3>{d.summary}</h3>
            <div className="summary-line">
              <span>
                {SERVICE_NAMES[service][locale]} · {d.bedroomsN(beds)}
              </span>
              <span>{formatUSD(toCents(q.base))}</span>
            </div>
            {q.extras.map((e) => (
              <div className="summary-line" key={e.id}>
                <span>{EXTRA_NAMES[e.id][locale]}</span>
                <span>+{formatUSD(toCents(e.price))}</span>
              </div>
            ))}
            {q.discount > 0 && (
              <div className="summary-line" style={{ color: "var(--ok)" }}>
                <span>{isPlan(service) ? d.firstMonth : d.hostIntro}</span>
                <span>−{formatUSD(toCents(q.discount))}</span>
              </div>
            )}
            <div className="summary-line total">
              <span>{d.total}</span>
              <span>
                {formatUSD(toCents(q.dueNow))}
                {service === "host" ? ` ${d.perTurnover}` : ""}
              </span>
            </div>
            {q.recurring !== undefined && (
              <p className="muted small">
                {d.fromSecondMonth}: {formatUSD(toCents(q.recurring))}
                {priceSuffix}
              </p>
            )}
            {service === "host" && <p className="muted small">{d.hostCardNote}</p>}
          </div>
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="spread" style={{ marginTop: 20 }}>
        {step > 0 ? (
          <button type="button" className="btn ghost" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={pending}>
            {d.back}
          </button>
        ) : (
          <span />
        )}
        {step > 0 && step < 4 && (
          <button type="button" className="btn" onClick={next}>
            {d.next}
          </button>
        )}
        {step === 4 && (
          <button type="button" className="btn coral" onClick={submit} disabled={pending}>
            {pending ? "…" : service === "host" ? d.saveCard : d.payNow}
          </button>
        )}
      </div>
    </div>
  );
}
