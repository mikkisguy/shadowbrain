"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

/**
 * Tooltip primitives (shadcn-style) built on Base UI.
 *
 * The popup is portalled to <body>, so it floats above any
 * `overflow: hidden` ancestor — important here because the feed
 * cards clip their contents. It opens on hover *and* keyboard
 * focus, so the exact timestamp is reachable without a mouse.
 *
 *   <Tooltip>
 *     <TooltipTrigger render={<button />}>Open</TooltipTrigger>
 *     <TooltipContent side="top">Jun 22, 2026, 9:55 PM</TooltipContent>
 *   </Tooltip>
 */

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

/**
 * App-wide default timing for every descendant tooltip.
 *
 * Base UI's out-of-the-box open delay is long (so tooltips don't
 * flicker on every element a pointer sweeps past). For this app
 * that read as sluggish, so the root layout wraps the tree in a
 * `delay={300}` provider — responsive, but still not jittery. It
 * also enables Base UI's grouping: once one tooltip has opened,
 * moving to an adjacent trigger opens it instantly.
 */
function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

function TooltipTrigger({
  className,
  ...props
}: TooltipPrimitive.Trigger.Props) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  ...props
}: TooltipPrimitive.Popup.Props & {
  /** Which side of the trigger the popup anchors to. Base UI
   *  will flip it automatically to keep the popup on screen. */
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "bg-popover text-popover-foreground border-border z-50 rounded-sm border px-2 py-1 font-mono text-[0.7rem] shadow-sm",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-100",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
