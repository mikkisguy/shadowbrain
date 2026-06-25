import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Item detail 404 state (issue #25).
 *
 * `page.tsx` calls `notFound()` when `findWithRelations` returns
 * `null` (the item does not exist, or is hidden/private without the
 * admin opt-in). Next.js then renders this segment-level not-found
 * UI in place of the page body. A plain link back to Browse is used
 * (rather than browser history) because a 404 has no reliable
 * "forward" destination to return to.
 */

export default function NotFound() {
  return (
    <main
      id="main-content"
      data-testid="item-not-found"
      className="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-sans text-sm transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to Browse
      </Link>

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground font-mono text-[0.7rem] font-medium tracking-[0.16em] uppercase">
          404
        </p>
        <h1 className="text-foreground font-serif text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          Item not found
        </h1>
        <p className="text-muted-foreground font-sans text-base">
          This item may have been deleted, or the link may be incorrect.
        </p>
      </div>

      <Link href="/" className="text-primary font-sans text-sm hover:underline">
        Browse all items
      </Link>
    </main>
  );
}
