/**
 * "Skip to main content" link.
 *
 * Visually hidden until focused (e.g. by keyboard `Tab` on first
 * page load). Lets keyboard users bypass the top nav and jump
 * straight to the page content. Required by WCAG 2.4.1 (Bypass
 * Blocks) at AA.
 *
 * The target id is `main-content`; the home page (and any future
 * page) wraps its primary content in `<main id="main-content">`.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="focus:border-primary focus:bg-background focus:text-foreground focus:ring-primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:h-8 focus:items-center focus:border focus:px-3 focus:text-sm focus:ring-1 focus:outline-none"
    >
      Skip to main content
    </a>
  );
}
