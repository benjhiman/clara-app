import { describe, it, expect } from "vitest";
import { quote, availableBedrooms, formatUSD, PricingError } from "./pricing";

describe("quote", () => {
  it("limpieza suelta con extras", () => {
    const q = quote("single", 2, ["oven", "extra_bath"]);
    expect(q.subtotal).toBe(235 + 35 + 25);
    expect(q.dueNow).toBe(295);
    expect(q.recurring).toBeUndefined();
  });
  it("plan con 25% el primer mes y extras por visita", () => {
    const q = quote("essential", 1, ["fridge"]);
    expect(q.subtotal).toBe(278 + 70);
    expect(q.dueNow).toBe(261);
    expect(q.recurring).toBe(348);
  });
  it("Host primer turnover al 50%", () => {
    expect(quote("host", 2, [], { hostIntro: true }).dueNow).toBe(77.5);
    expect(quote("host", 2, ["same_day"]).dueNow).toBe(180);
  });
  it("rechaza tamaños y extras inválidos", () => {
    expect(() => quote("host", 4)).toThrow(PricingError);
    expect(() => quote("single", 1, ["same_day"])).toThrow(PricingError);
    expect(availableBedrooms("host")).toEqual([1, 2, 3]);
  });
  it("formato", () => {
    expect(formatUSD(7750)).toBe("$77.50");
    expect(formatUSD(29900)).toBe("$299");
  });
});
