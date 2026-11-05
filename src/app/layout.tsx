import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NOCTA — Gece Dil Rutini",
  description:
    "Sakin bir gece rutini, yumuşak sesler ve yedi dilde aralıklı tekrar.",
  manifest: "/manifest.webmanifest",
  applicationName: "NOCTA",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "NOCTA" },
  // Eski iOS Safari sürümleri için standart meta etiketine ek olarak.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-black text-bone antialiased">{children}</body>
    </html>
  );
}
