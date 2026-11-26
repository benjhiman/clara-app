export const PAY: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pagado", cls: "ok" },
  included: { label: "En el plan", cls: "info" },
  to_charge: { label: "Se cobra al terminar", cls: "warn" },
  failed: { label: "Cobro falló", cls: "bad" },
  refunded: { label: "Devuelto", cls: "" },
  unpaid: { label: "Sin pagar", cls: "" },
};

