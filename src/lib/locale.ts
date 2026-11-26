import "server-only";
import { cookies } from "next/headers";
import { asLocale, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  return asLocale((await cookies()).get("clara_lang")?.value);
}
