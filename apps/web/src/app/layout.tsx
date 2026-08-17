import type { Metadata } from "next";
import { Bricolage_Grotesque, Dancing_Script, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { FeedbackFab } from "@/components/feedback/feedback-fab";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomCursor } from "@/components/custom-cursor";

import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const logoFont = Dancing_Script({ variable: "--font-logo", subsets: ["latin"], weight: ["700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://litera.almareem.com"),
  title: {
    default: "Litera — Inclusive publishing, made clear",
    template: "%s | Litera",
  },
  description: "Turn source books into responsive, accessible digital learning experiences with visual storyboarding and Swahili-first narration.",
  applicationName: "Litera",
  authors: [{ name: "Litera", url: "https://litera.almareem.com" }],
  creator: "Litera",
  publisher: "Litera",
  category: "Education",
  keywords: [
    "accessible publishing",
    "digital learning",
    "Swahili text to speech",
    "visual storyboarding",
    "inclusive education",
    "educational publishing software",
  ],
  openGraph: {
    type: "website",
    locale: "en_TZ",
    url: "/",
    siteName: "Litera",
    title: "Litera — Inclusive publishing, made clear",
    description: "Turn source books into accessible digital learning experiences with visual storyboarding and Swahili-first narration.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Litera — Inclusive publishing, made clear" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Litera — Inclusive publishing, made clear",
    description: "Accessible digital learning experiences with visual storyboarding and Swahili-first narration.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
  formatDetection: { email: false, address: false, telephone: false },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://litera.almareem.com/#organization",
      name: "Litera",
      url: "https://litera.almareem.com",
      logo: "https://litera.almareem.com/icon.svg",
      description: "Inclusive publishing technology for accessible digital learning.",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://litera.almareem.com/#software",
      name: "Litera",
      url: "https://litera.almareem.com",
      downloadUrl: "https://litera.almareem.com/download",
      applicationCategory: "EducationalApplication",
      operatingSystem: "macOS, Windows, Linux",
      description: "A visual publishing workspace for accessible learning experiences and Swahili-first narration.",
      featureList: ["Visual storyboarding", "Accessibility review", "Swahili-first narration", "Role-based collaboration", "Desktop publishing"],
      publisher: { "@id": "https://litera.almareem.com/#organization" },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${bricolage.variable} ${geistMono.variable} ${logoFont.variable}`} lang="en" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
        <ThemeProvider>
          <CustomCursor />
          <TooltipProvider>{children}</TooltipProvider>
          <FeedbackFab />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
