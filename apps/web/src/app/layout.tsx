import type { Metadata } from "next";
import type { ReactNode } from "react";
import { webFontVariables } from "@/lib/web-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Photo Book Maker",
  description:
    "A mobile-first system for collaborative trip books and yearbooks that still exports a polished, professional-looking layout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${webFontVariables}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
