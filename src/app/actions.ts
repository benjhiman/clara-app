"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth";

export async function setLang(lang: string, back: string) {
  (await cookies()).set("clara_lang", lang === "en" ? "en" : "es", { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

export async function logout() {
  await endSession();
  redirect("/entrar");
}
