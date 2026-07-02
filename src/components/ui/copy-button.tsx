"use client";

import { useState, useCallback } from "react";
import type * as React from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
  value: string;
  label?: string;
  copiedLabel?: string;
};

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "outline",
  size = "sm",
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        success = true;
      } else {
        // Fallback for insecure contexts / SSR
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    } catch {
      success = false;
    }

    if (success) {
      setCopied(true);
      toast.success("Copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  }, [value]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={cn(className)}
      aria-label={copied ? copiedLabel : label}
      {...props}
    >
      {copied ? (
        <>
          <Check className="size-3.5" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
