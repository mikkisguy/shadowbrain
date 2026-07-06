"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BookmarkMetadata } from "@/lib/metadata-fetcher";

interface BookmarkPreviewProps {
  url: string;
  onMetadataFetched: (metadata: BookmarkMetadata | null) => void;
  onTitlePrefill: (title: string) => void;
}

/** Fast check: is `raw` a syntactically-valid http(s) URL? */
function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function BookmarkPreview({
  url,
  onMetadataFetched,
  onTitlePrefill,
}: BookmarkPreviewProps) {
  const [previewMetadata, setPreviewMetadata] =
    useState<BookmarkMetadata | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevUrlRef = useRef(url);

  const triggerFetch = useCallback(
    async (fetchUrl: string) => {
      if (!fetchUrl) return;
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewMetadata(null);
      onMetadataFetched(null);
      try {
        const res = await fetch(
          `/api/bookmarks/preview?url=${encodeURIComponent(fetchUrl)}`
        );
        const data = await res.json();
        if (data.ok) {
          setPreviewMetadata(data.metadata);
          onMetadataFetched(data.metadata);
          if (data.metadata.title) {
            onTitlePrefill(data.metadata.title);
          }
        } else {
          setPreviewError(data.reason ?? "Could not preview this URL");
        }
      } catch {
        setPreviewError("Network error");
      } finally {
        setPreviewLoading(false);
      }
    },
    [onMetadataFetched, onTitlePrefill]
  );

  // Debounced fetch on URL change — never calls setState synchronously
  // (the triggerFetch callback is deferred by setTimeout).
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || !isValidHttpUrl(trimmed)) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => triggerFetch(trimmed), 500);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [url, triggerFetch]);

  // Notify parent when URL transitions from valid to empty so stale
  // metadata doesn't leak into a submit.
  useEffect(() => {
    const wasValid =
      prevUrlRef.current.trim() && isValidHttpUrl(prevUrlRef.current.trim());
    const isValid = url.trim() && isValidHttpUrl(url.trim());
    prevUrlRef.current = url;

    if (wasValid && !isValid) {
      onMetadataFetched(null);
    }
  }, [url, onMetadataFetched]);

  const hasValidUrl = url.trim() && isValidHttpUrl(url.trim());

  return (
    <>
      {previewLoading && hasValidUrl && (
        <div className="bg-muted/30 text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
          <svg
            className="size-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading preview…
        </div>
      )}
      {previewError && !previewLoading && hasValidUrl && (
        <div className="bg-muted/30 text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
          <svg
            className="size-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Preview unavailable</span>
        </div>
      )}
      {previewMetadata && !previewLoading && hasValidUrl && (
        <div
          data-testid="bookmark-preview-card"
          className="bg-muted/30 flex items-start gap-3 rounded-lg border p-3"
        >
          {previewMetadata.favicon && (
            <img
              src={`/api/bookmarks/image-proxy?url=${encodeURIComponent(previewMetadata.favicon)}`}
              alt=""
              className="mt-0.5 size-4 shrink-0 rounded"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {previewMetadata.title || "Untitled"}
            </p>
            {previewMetadata.description && (
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                {previewMetadata.description}
              </p>
            )}
            {previewMetadata.site_name && (
              <p className="text-muted-foreground mt-1 text-[10px]">
                {previewMetadata.site_name}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
