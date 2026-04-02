// SOFT LOCK v0.9: UI contains zero governance logic.
// All state mutation must pass through governed API/RPC write paths.
// If it isn't written here, it didn't happen.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { REVENUE_ENFORCEMENT_CATEGORY } from "@/lib/ui-fmt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `AutoKirk — ${REVENUE_ENFORCEMENT_CATEGORY}`,
  description: `Governance kernel for ${REVENUE_ENFORCEMENT_CATEGORY.toLowerCase()}. Obligations, receipts, and enforcement in one system.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
