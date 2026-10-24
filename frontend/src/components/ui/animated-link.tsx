// Adapted from Skiper UI’s free Skiper 40 / Link000 component.
// https://skiper-ui.com/r/skiper40.json — author @gurvinder-singh02.
// Free personal/commercial use with attribution; see THIRD_PARTY_NOTICES.md.
// Local changes: focus-visible parity, reduced-motion support, no utility helper.
import Link from "next/link";
export function AnimatedLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="animated-link">
      {children}
    </Link>
  );
}
