import { describe, it, expect } from "vitest";
import { planVisits, validateDate, zoneForZip, slotStart, canCustomerCancel, todayISO } from "./schedule";

describe("schedule", () => {
  it("zonas por ZIP", () => {
    expect(zoneForZip("33131")).toBe("Brickell");
    expect(zoneForZip("33178-1234")).toBe("Doral");
    expect(zoneForZip("10001")).toBeNull();
  });
  it("Essential cada 14 días", () => {
    const v = planVisits("essential", "2026-12-01", "2026-12-01", "2026-12-31");
    expect(v.map((x) => x.date)).toEqual(["2026-12-01", "2026-12-15", "2026-12-29"]);
  });
  it("Plus: profunda la primera visita del mes", () => {
    const v = planVisits("plus", "2026-12-16", "2026-12-16", "2027-01-20");
    expect(v.map((x) => x.service)).toEqual(["plus_deep", "plus", "plus", "plus_deep", "plus", "plus"]);
    expect(v[3].date).toBe("2027-01-06");
  });
  it("planVisits desde una fecha posterior mantiene el ritmo", () => {
    const v = planVisits("essential", "2026-12-01", "2026-12-10", "2026-12-31");
    expect(v.map((x) => x.date)).toEqual(["2026-12-15", "2026-12-29"]);
  });
  it("valida fechas", () => {
    const now = new Date("2026-11-26T15:00:00Z"); // jueves
    expect(validateDate("single", "2026-11-27", [], now)).toBe("too_soon");
    expect(validateDate("single", "2026-11-28", [], now)).toBeNull();
    expect(validateDate("single", "2026-11-29", [], now)).toBe("sunday");
    expect(validateDate("host", "2026-11-26", ["same_day"], now)).toBeNull();
    expect(validateDate("host", "2026-11-26", [], now)).toBe("too_soon");
  });
  it("hora de Miami y cancelación", () => {
    expect(slotStart("2026-12-01", "morning").toISOString()).toBe("2026-12-01T13:00:00.000Z");
    expect(slotStart("2026-07-01", "afternoon").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(canCustomerCancel("2026-12-02", "morning", new Date("2026-12-01T12:00:00Z"))).toBe(true);
    expect(canCustomerCancel("2026-12-02", "morning", new Date("2026-12-01T14:00:00Z"))).toBe(false);
    expect(todayISO(new Date("2026-11-27T03:00:00Z"))).toBe("2026-11-26");
  });
});
