"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types matching the API response from GET /api/items/[id]          */
/* ------------------------------------------------------------------ */

interface ItemDetail {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  /** JSON string stored in the DB; must be parsed before use. */
  metadata: string | null;
  is_private: number;
  is_hidden: number;
  created_at: string;
  updated_at: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

interface LinkedItem {
  id: string;
  title: string | null;
  type: string;
}

interface OutboundLink {
  id: string;
  target: LinkedItem;
  link_type: string;
}

interface InboundLink {
  id: string;
  source: LinkedItem;
  link_type: string;
}

export interface ItemDetailResponse {
  item: ItemDetail;
  tags: Tag[];
  links: {
    outbound: OutboundLink[];
    inbound: InboundLink[];
  };
}

export function useItemDetail(itemId: string | null) {
  const [data, setData] = useState<ItemDetailResponse | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const cancelledRef = useRef(false);

  const fetchItem = useCallback((id: string, { reset }: { reset: boolean }) => {
    if (reset) {
      setStatus("loading");
      setData(null);
    }
    fetch(`/api/items/${id}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "Request failed");
          throw new Error(text);
        }
        return res.json() as Promise<ItemDetailResponse>;
      })
      .then((json) => {
        if (!cancelledRef.current) {
          setData(json);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!cancelledRef.current) {
          setStatus("error");
        }
      });
  }, []);

  // When `itemId` changes, fetch the item detail. When it becomes null
  // the sheet closes (via `open` being false) so there is no need to
  // reset local state — the next non-null `itemId` will overwrite it.
  // The synchronous setState calls here are the standard React pattern
  // for data-fetching effects (same pattern in use-browse-state.ts).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!itemId) return;
    cancelledRef.current = false;
    fetchItem(itemId, { reset: true });
    return () => {
      cancelledRef.current = true;
    };
  }, [itemId, fetchItem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRetry = useCallback(() => {
    if (!itemId) return;
    cancelledRef.current = false;
    fetchItem(itemId, { reset: false });
  }, [itemId, fetchItem]);

  /** Re-fetch with a full reset (loading state + data clear). Used after edits. */
  const refetch = useCallback(() => {
    if (!itemId) return;
    cancelledRef.current = false;
    fetchItem(itemId, { reset: true });
  }, [itemId, fetchItem]);

  return {
    data,
    status,
    handleRetry,
    refetch,
  };
}
