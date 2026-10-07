import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SettingsProvider } from "@/lib/settings-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Prompt Optimizer · NODAYSIDLE",
    template: "%s · NODAYSIDLE Prompt Optimizer",
  },
  description:
    "Production prompt engineering workbench powered by DeepSeek Platform Flash API and TypeSafe Jev System One diagnostics.",
  keywords: ["prompt optimizer", "DeepSeek", "TypeSafe Jev", "system prompt", "LLM prompts"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground font-sans">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
