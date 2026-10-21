import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Condensed } from "next/font/google";
import { SettingsProvider } from "@/lib/settings-context";
import "./globals.css";

// The studio's own faces, as on the apps site: condensed display for the name and
// section titles, Plex Sans for controls, Plex Mono for prompt text where spacing matters.
const display = Saira_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});
const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Prompt Optimizer · NODAYSIDLE",
    template: "%s · NODAYSIDLE Prompt Optimizer",
  },
  description:
    "Paste a prompt and get back edits to your own words. Keep the ones you want. User, system, image and video prompts.",
  keywords: ["prompt optimizer", "system prompt", "image prompt", "video prompt", "LLM prompts"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
