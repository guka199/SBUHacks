import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { SessionProvider } from "@/components/session";
export const metadata: Metadata = { title: "ViralPilot — Make every frame count", description: "One video. Every platform. Smarter creative decisions. Explore AI content-readiness insights and platform-specific improvements." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><SessionProvider><Navigation /><main id="main">{children}</main></SessionProvider></body></html>;
}
