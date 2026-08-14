import type { Metadata } from "next";
import { Bricolage_Grotesque, Dancing_Script, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const logoFont = Dancing_Script({ variable: "--font-logo", subsets: ["latin"], weight: ["700"] });

export const metadata: Metadata = {
  title: "Litera — Accessible publishing workspace",
  description: "Create responsive, inclusive digital learning experiences with a clear visual workflow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${bricolage.variable} ${geistMono.variable} ${logoFont.variable}`} lang="en" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
