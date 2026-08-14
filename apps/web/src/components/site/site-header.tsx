"use client";

import { BookOpen, Download, Info, Layers3, Menu, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { href: "/features", label: "Features", icon: Layers3 },
  { href: "/accessibility", label: "Accessibility", icon: ShieldCheck },
  { href: "/about", label: "About", icon: Info },
  { href: "/download", label: "Download", icon: Download },
  { href: "/updates", label: "Updates", icon: RefreshCw },
  { href: "/contact", label: "Contact", icon: BookOpen },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" href="/">
          <BrandMark />
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Button asChild key={link.href} size="sm" variant="ghost">
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className="relative after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-out hover:after:scale-x-100 focus-visible:after:scale-x-100 aria-[current=page]:after:scale-x-100"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </Button>
            );
          })}
          <Separator className="mx-2 !h-5 !self-center" orientation="vertical" />
          <ThemeToggle />
          <Button asChild size="sm"><Link href="/download">Download</Link></Button>
        </nav>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild><Button aria-label="Open navigation" size="icon" variant="outline"><Menu /></Button></SheetTrigger>
            <SheetContent className="p-0">
              <SheetHeader className="border-b p-6 text-start"><SheetTitle>Litera</SheetTitle><SheetDescription>Create accessible digital learning experiences.</SheetDescription></SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col gap-2 p-4">
                {links.map((link) => <Button asChild className="justify-start" key={link.href} variant="ghost"><Link href={link.href}><link.icon />{link.label}</Link></Button>)}
                <Separator className="my-2" />
                <Button asChild><Link href="/download"><Download data-icon="inline-start" />Download Litera</Link></Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
