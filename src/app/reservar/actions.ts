"use server";
import { z } from "zod";
import { createBooking, BookingError } from "@/lib/bookings";
import { isService, PricingError } from "@/lib/pricing";
import { isTimeSlot } from "@/lib/schedule";

const Input = z.object({
  service: z.string().refine(isService),
  bedrooms: z.number().int().min(1).max(4),
  extras: z.array(z.string()).max(6),
  address: z.string().trim().min(3).max(200),
  unit: z.string().trim().max(40).optional(),
  zip: z.string().trim().min(5).max(10),
  accessNotes: z.string().trim().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().refine(isTimeSlot),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  notes: z.string().trim().max(1000).optional(),
  locale: z.enum(["es", "en"]),
});

export async function createBookingAction(raw: unknown): Promise<{ url: string } | { error: string }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { error: "required" };
  try {
    const url = await createBooking(parsed.data);
    return { url };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.code };
    if (e instanceof PricingError) return { error: "generic" };
    console.error("Error creando reserva", e);
    return { error: "generic" };
  }
}
