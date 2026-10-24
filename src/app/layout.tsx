import type { Metadata } from "next";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/dm-sans";
import "./globals.css";
import "./cinematic.css";
import "./app-theme.css";
import "./experience.css";
import { Navigation } from "@/components/navigation";
import { SessionProvider } from "@/components/session";
export const metadata: Metadata = {
  title: "ViralPilot — Make every frame count",
  description:
    "One video. Every platform. Smarter creative decisions. Explore AI content-readiness insights and platform-specific improvements.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Navigation />
          <main id="main">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
