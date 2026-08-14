import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return <span aria-label="Litera" className={cn("inline-block whitespace-nowrap text-3xl font-bold leading-none tracking-[-0.06em] text-primary",className)} style={{fontFamily:"var(--font-logo),'SignPainter','Snell Roundhand',cursive"}}>Litera</span>;
}
