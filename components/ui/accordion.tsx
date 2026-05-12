// Minimal Accordion — shadcn-compatible API, uses native <details>/<summary>
// so we avoid the @radix-ui/react-accordion dep. Used by superlearner/DomainStats.
"use client";
import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

const AccordionContext = createContext<{ type: "single" | "multiple" }>({ type: "single" });

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  collapsible?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (v: string | string[]) => void;
}

export function Accordion({ type = "single", className, children, ...rest }: AccordionProps) {
  return (
    <AccordionContext.Provider value={{ type }}>
      <div className={cn("space-y-1", className)} {...rest}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps extends React.HTMLAttributes<HTMLDetailsElement> {
  value?: string;
}
export function AccordionItem({ className, children, ...rest }: AccordionItemProps) {
  return (
    <details className={cn("rounded border border-gray-200", className)} {...rest}>
      {children}
    </details>
  );
}

export function AccordionTrigger({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <summary className={cn("cursor-pointer select-none px-3 py-2 font-medium", className)} {...rest}>
      {children}
    </summary>
  );
}

export function AccordionContent({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-3 pb-3 text-sm", className)} {...rest}>
      {children}
    </div>
  );
}

// Re-export the context for completeness (unused by stubs but matches shadcn surface)
export { AccordionContext };
