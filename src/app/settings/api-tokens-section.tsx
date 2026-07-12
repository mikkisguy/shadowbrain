"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { queryKeys } from "@/lib/query-config";
import { formatAbsolute } from "@/lib/dates";
import {
  createApiToken,
  fetchApiTokens,
  revokeApiToken,
  SettingsApiError,
} from "./api";
import type { ApiTokenInfo, CreatedApiToken } from "./api";

function TokenSkeleton() {
  return (
    <div className="border-border grid grid-cols-[1fr_140px_140px_90px_100px] items-center gap-4 border-b px-3 py-3 last:border-b-0">
      <div className="bg-surface-muted h-4 w-3/4 animate-pulse rounded-sm" />
      <div className="bg-surface-muted h-4 w-24 animate-pulse rounded-sm" />
      <div className="bg-surface-muted h-4 w-24 animate-pulse rounded-sm" />
      <div className="bg-surface-muted h-4 w-16 animate-pulse rounded-sm" />
      <div className="bg-surface-muted h-7 w-20 animate-pulse justify-self-end rounded-sm" />
    </div>
  );
}

function CreatedTokenDialog({
  token,
  onOpenChange,
}: {
  token: CreatedApiToken;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Token created</DialogTitle>
          <DialogDescription>
            Make sure to copy your token now. You won&apos;t be able to see it
            again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="border-border bg-surface-muted flex items-center gap-3 rounded-sm border p-3">
            <code className="text-foreground flex-1 font-mono text-xs break-all">
              {token.token}
            </code>
            <CopyButton value={token.token} label="Copy" size="sm" />
          </div>
          <p className="text-muted-foreground font-sans text-xs">
            Name:{" "}
            <span className="text-foreground font-medium">{token.name}</span>
          </p>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="default" />}>
            Done
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeTokenDialog({
  token,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  token: ApiTokenInfo;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Revoke token</DialogTitle>
          <DialogDescription>
            Revoke token &quot;{token.name}&quot;? Any requests using this token
            will be immediately rejected.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiTokensSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(
    null
  );
  const [tokenToRevoke, setTokenToRevoke] = useState<ApiTokenInfo | null>(null);

  const {
    data: tokens,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.apiTokens.list,
    queryFn: ({ signal }) => fetchApiTokens(signal),
    staleTime: 0,
  });

  const sortedTokens = useMemo(() => {
    if (!tokens) return [];
    return [...tokens].sort((a, b) => {
      if (a.is_revoked !== b.is_revoked) return a.is_revoked - b.is_revoked;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [tokens]);

  const createMutation = useMutation({
    mutationFn: createApiToken,
    onSuccess: (data) => {
      setCreatedToken(data);
      setName("");
    },
    onError: (error) => {
      let message = "Couldn't create the token. Please try again.";
      if (error instanceof SettingsApiError) {
        if (error.status === 400) {
          message = "Invalid token name. Use 1–200 characters.";
        } else if (error.status === 401) {
          message = "Your session expired. Refresh the page and try again.";
        }
      }
      toast.error(message);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiToken,
    onSuccess: () => {
      toast.success("Token revoked.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.all });
      setTokenToRevoke(null);
    },
    onError: () => {
      toast.error("Couldn't revoke the token. Please try again.");
    },
  });

  function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  }

  function handleCreatedDialogClose(open: boolean) {
    if (!open) {
      setCreatedToken(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens.all });
    }
  }

  function handleRevokeConfirm() {
    if (tokenToRevoke) {
      revokeMutation.mutate(tokenToRevoke.id);
    }
  }

  return (
    <section
      className="border-border bg-surface-elevated/40 flex flex-col gap-5 rounded-sm border p-5"
      data-testid="api-tokens-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground font-serif text-xl font-semibold">
          API Tokens
        </h2>
        <p className="text-muted-foreground font-sans text-sm">
          Manage bearer tokens for programmatic access to ShadowBrain.
        </p>
      </header>

      <form
        onSubmit={handleCreateSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label
            htmlFor="token-name"
            className="text-foreground font-sans text-sm font-medium"
          >
            Token name
          </label>
          <Input
            id="token-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. CLI backup script"
            maxLength={200}
            disabled={createMutation.isPending}
            data-testid="token-name-input"
          />
        </div>
        <Button
          type="submit"
          disabled={!name.trim() || createMutation.isPending}
          data-testid="generate-token-button"
        >
          <Plus className="size-4" />
          Generate token
        </Button>
      </form>

      {isError ? (
        <div className="border-border bg-surface-elevated flex flex-col items-start gap-3 rounded-sm border p-6">
          <p className="text-error font-sans text-sm font-medium">
            Couldn&apos;t load API tokens.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="tokens-retry"
          >
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <div className="border-border overflow-hidden rounded-sm border">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="border-border bg-surface-muted/30 text-muted-foreground grid grid-cols-[1fr_140px_140px_90px_100px] items-center gap-4 border-b px-3 py-2 font-mono text-xs tracking-wider uppercase">
                <div>Name</div>
                <div>Created</div>
                <div>Last used</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>
              <TokenSkeleton />
              <TokenSkeleton />
              <TokenSkeleton />
            </div>
          </div>
        </div>
      ) : sortedTokens.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-2 rounded-sm border p-8 text-center">
          <p className="text-foreground font-sans text-sm font-medium">
            No API tokens yet
          </p>
          <p className="text-muted-foreground font-sans text-sm">
            Create a token to authenticate programmatic requests.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-sm border">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="border-border bg-surface-muted/30 text-muted-foreground grid grid-cols-[1fr_140px_140px_90px_100px] items-center gap-4 border-b px-3 py-2 font-mono text-xs tracking-wider uppercase">
                <div>Name</div>
                <div>Created</div>
                <div>Last used</div>
                <div>Status</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="flex flex-col">
                {sortedTokens.map((token) => (
                  <div
                    key={token.id}
                    className={`border-border grid grid-cols-[1fr_140px_140px_90px_100px] items-center gap-4 border-b px-3 py-3 last:border-b-0 ${
                      token.is_revoked ? "opacity-60" : ""
                    }`}
                    data-testid={`token-row-${token.id}`}
                  >
                    <div
                      className={`font-sans text-sm ${
                        token.is_revoked
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {token.name}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {formatAbsolute(token.created_at)}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {token.last_used_at
                        ? formatAbsolute(token.last_used_at)
                        : "Never"}
                    </div>
                    <div className="font-sans text-xs">
                      {token.is_revoked ? (
                        <span className="text-muted-foreground">Revoked</span>
                      ) : (
                        <span className="text-success">Active</span>
                      )}
                    </div>
                    <div className="text-right">
                      {!token.is_revoked && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTokenToRevoke(token)}
                          data-testid={`revoke-token-${token.id}`}
                        >
                          <Trash2 className="size-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {createdToken ? (
        <CreatedTokenDialog
          token={createdToken}
          onOpenChange={handleCreatedDialogClose}
        />
      ) : null}

      {tokenToRevoke ? (
        <RevokeTokenDialog
          token={tokenToRevoke}
          onOpenChange={(open) => {
            if (!open) setTokenToRevoke(null);
          }}
          onConfirm={handleRevokeConfirm}
          isPending={revokeMutation.isPending}
        />
      ) : null}
    </section>
  );
}
