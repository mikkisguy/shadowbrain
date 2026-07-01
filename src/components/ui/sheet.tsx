"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Reusable sheet (slide-over panel) built on Base UI Dialog.       */
/*                                                                    */
/*  Supports four sides; each pins the panel to that viewport edge   */
/*  with a matching slide animation. The scrim overlay fades in/out  */
/*  like the existing Dialog component.                              */
/* ------------------------------------------------------------------ */

const SHEET_SIDES = {
  top: "inset-x-0 top-0 rounded-b-xl border-b data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-full",
  bottom:
    "inset-x-0 bottom-0 rounded-t-xl border-t data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-full",
  left: "inset-y-0 left-0 h-full w-3/4 rounded-r-xl border-r sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-left-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-left-full",
  right:
    "inset-y-0 right-0 h-full w-3/4 rounded-l-xl border-l sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right-full",
} as const;

type SheetSide = keyof typeof SHEET_SIDES;

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        // Duration matches the panel's (200ms) so the scrim + blur
        // fade out in lockstep with the slide — a shorter overlay
        // duration makes the backdrop vanish mid-close while the
        // panel is still sliding, which reads as a blur "flash".
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 bg-scrim fixed inset-0 isolate z-50 duration-200 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  side = "right",
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: SheetSide;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 fixed z-50 flex flex-col gap-4 overflow-hidden p-6 ring-1 duration-200 outline-none",
          SHEET_SIDES[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-mono text-sm leading-none font-medium tracking-wide uppercase",
        className
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
