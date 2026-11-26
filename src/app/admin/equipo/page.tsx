import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import Header from "../../components/Header";
import AdminNav from "../AdminNav";
import { addCleaner, setCleanerActive } from "../actions";

export const metadata: Metadata = { title: "Equipo" };

export default async function Equipo({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireUser(["admin"], "/admin/equipo");
  const sp = await searchParams;
  const db = await getDb();
  const team = await db.select().from(schema.users).where(eq(schema.users.role, "cleaner")).orderBy(asc(schema.users.name));
  return (
    <>
      <Header locale="es" path="/admin" showLang={false} />
      <main className="wrap narrow">
        <h1>Equipo</h1>
        <AdminNav current="/admin/equipo" />
        {sp.ok && <p className="notice">Listo. Ya puede entrar en /entrar con su email y va a ver sus trabajos.</p>}
        {sp.error && <p className="notice bad">{sp.error === "admin" ? "Ese email es de un socio." : "Completá nombre y email."}</p>}
        <div className="card">
          <h2>Agregar limpiador</h2>
          <form action={addCleaner}>
            <div className="grid2">
              <div className="field">
                <label>Nombre</label>
                <input type="text" name="name" required />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input type="tel" name="phone" />
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" name="email" required />
            </div>
            <button className="btn">Agregar</button>
          </form>
        </div>
        <div className="card">
          <h2>Limpiadores</h2>
          {team.length === 0 && <p className="muted">Todavía no agregaste a nadie.</p>}
          <ul className="list">
            {team.map((u) => (
              <li key={u.id} className="spread">
                <div>
                  <strong>{u.name}</strong> {!u.active && <span className="badge">Inactivo</span>}
                  <div className="muted small">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </div>
                </div>
                <form action={setCleanerActive.bind(null, u.id, !u.active)}>
                  <button className={`btn sm ${u.active ? "danger" : "ghost"}`}>{u.active ? "Desactivar" : "Reactivar"}</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
