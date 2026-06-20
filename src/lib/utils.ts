import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatenate Tailwind class names, deduping conflicting utilities
 * via `tailwind-merge`. This is the standard helper used by shadcn/ui
 * components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
