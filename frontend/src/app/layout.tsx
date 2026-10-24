import type { Metadata } from "next";
import "@fontsource/archivo-black/400.css";

import "@fontsource-variable/dm-sans";
import "./globals.css";
import "./cinematic.css";
import "./app-theme.css";
import "./experience.css";
import "./identity.css";
import { Navigation } from "@/components/navigation";
import { SessionProvider } from "@/components/session";
import { AuthProvider } from "@/lib/auth";
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
          <AuthProvider>
            <Navigation />
            <main id="main">{children}</main>
          </AuthProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
