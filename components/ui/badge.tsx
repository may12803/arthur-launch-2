// Minimal Badge component — shadcn-compatible API. Used by superlearner/DomainStats.
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantClass = {
    default: "bg-blue-500 text-white",
    secondary: "bg-gray-200 text-gray-900",
    outline: "border border-gray-300 text-gray-700",
    destructive: "bg-red-500 text-white",
  }[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantClass,
        className,
      )}
      {...props}
    />
  );
}
