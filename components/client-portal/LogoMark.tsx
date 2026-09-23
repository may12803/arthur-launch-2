import { cn } from "@/lib/utils";

// Daniel's heart, exactly as loveleedaystudios.com renders it: the PNG mask
// embedded in the site's assets/site.css (extracted to public/brand/
// mark-mask.png) over currentColor, so it tints per surface — ink in the
// header, white in the dark footer.
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={cn("ll-mark", className)} style={{ width: size, height: size }} />;
}

// The site's `.brand` lockup: mark + "LOVELEEDAY", 13px, .12em tracking, 650.
export function Wordmark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("ll-brand", className)}>
      <LogoMark size={size} />
      LOVELEEDAY
    </span>
  );
}
