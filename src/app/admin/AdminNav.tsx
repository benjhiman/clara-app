import Link from "next/link";

const TABS = [
  { href: "/admin", label: "Agenda" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/equipo", label: "Equipo" },
];

export default function AdminNav({ current }: { current: string }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={current === t.href ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
