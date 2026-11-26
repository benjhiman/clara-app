import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { env, sessionKey } from "./env";

const COOKIE = "clara_session";
const SESSION_DAYS = 30;
const TOKEN_MINUTES = 30;

export type Role = "client" | "cleaner" | "admin";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Solo acepta rutas internas para evitar redirecciones a otros sitios. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

export async function createLoginToken(email: string, next?: string | null): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(schema.loginTokens).values({
    tokenHash: hash(token),
    email: normalizeEmail(email),
    next: safeNext(next),
    expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
  });
  return `${env.appUrl}/entrar/confirmar?token=${encodeURIComponent(token)}`;
}

/** Busca o crea el usuario por email. Los emails de ADMIN_EMAILS son siempre admin. */
export async function upsertUser(
  email: string,
  data: { name?: string | null; phone?: string | null; locale?: string } = {},
): Promise<User> {
  const db = await getDb();
  const e = normalizeEmail(email);
  const isAdmin = env.adminEmails.includes(e);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, e));
  if (existing) {
    const patch: Partial<User> = {};
    if (data.name && !existing.name) patch.name = data.name;
    if (data.phone && !existing.phone) patch.phone = data.phone;
    if (isAdmin && existing.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length) {
      const [u] = await db.update(schema.users).set(patch).where(eq(schema.users.id, existing.id)).returning();
      return u;
    }
    return existing;
  }
  const [u] = await db
    .insert(schema.users)
    .values({
      email: e,
      name: data.name ?? null,
      phone: data.phone ?? null,
      locale: data.locale ?? "es",
      role: isAdmin ? "admin" : "client",
    })
    .onConflictDoUpdate({ target: schema.users.email, set: { email: e } })
    .returning();
  return u;
}

/** Usa el token del email. Devuelve a dónde ir, o null si no sirve. */
export async function consumeLoginToken(token: string): Promise<{ user: User; next: string | null } | null> {
  const db = await getDb();
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.loginTokens.tokenHash, hash(token)),
        isNull(schema.loginTokens.usedAt),
        gt(schema.loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) return null;
  const user = await upsertUser(row.email);
  if (!user.active) return null;
  await startSession(user);
  return { user, next: row.next };
}

export async function startSession(user: User) {
  const jwt = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionKey());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jwt = (await cookies()).get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, sessionKey());
    if (!payload.sub) return null;
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    return u && u.active ? u : null;
  } catch {
    return null;
  }
}

export function homeFor(role: string) {
  return role === "admin" ? "/admin" : role === "cleaner" ? "/limpiador" : "/cuenta";
}

/** Para páginas: exige sesión con alguno de los roles. Los admin pueden entrar a todo. */
export async function requireUser(roles: Role[], next: string): Promise<User> {
  const u = await currentUser();
  if (!u) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  if (u.role !== "admin" && !roles.includes(u.role as Role)) redirect(homeFor(u.role));
  return u;
}
