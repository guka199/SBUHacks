import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/score", label: "Score a post" },
  { href: "/rewards", label: "Rewards" },
];

export function Nav() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold">
          PostPilot
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm opacity-70 hover:opacity-100">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
