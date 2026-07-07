"use client";

/**
 * Shared type-specific field renderer.
 *
 * Renders the metadata fields for bookmark, person, project, event,
 * and dream types. Used by both the quick-add dialog and the /add
 * page so the field layout stays consistent across surfaces.
 *
 * The bookmark preview card is NOT included here — it depends on
 * preview state (loading / error / metadata) that each surface
 * manages differently. The bookmark URL input IS included; the
 * add dialog wraps it with onBlur and preview logic.
 */

import type { KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Draft } from "@/lib/add-form/types";
import { hasTypeSpecificFields } from "@/lib/add-form/types";

export interface TypeSpecificFieldsProps {
  draft: Draft;
  updateField: <K extends keyof Draft>(field: K, value: Draft[K]) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  /** Extra props spread onto the bookmark URL input (e.g. onBlur, ref). */
  bookmarkUrlProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /** Extra props spread onto the image URL input (e.g. disabled when file selected). */
  imageUrlProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export function TypeSpecificFields({
  draft,
  updateField,
  handleKeyDown,
  bookmarkUrlProps,
  imageUrlProps,
}: TypeSpecificFieldsProps) {
  if (!hasTypeSpecificFields(draft.type)) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Details
      </p>

      {draft.type === "image" && (
        <div className="flex flex-col gap-2">
          <Input
            data-testid="add-dialog-image-url"
            className="h-7 text-xs"
            placeholder="Image URL"
            value={draft.imageUrl}
            onChange={(e) => updateField("imageUrl", e.target.value)}
            onKeyDown={handleKeyDown}
            type="url"
            {...imageUrlProps}
          />
          <Textarea
            data-testid="add-dialog-content"
            className="placeholder:text-muted-foreground/50 min-h-[48px] resize-none border-0 bg-transparent px-0 text-xs leading-relaxed focus-visible:ring-0"
            placeholder="Notes about this image (optional)…"
            value={draft.content}
            onChange={(e) => updateField("content", e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {draft.type === "bookmark" && (
          <Input
            data-testid="add-dialog-bookmark-url"
            className="col-span-2 h-7 text-xs"
            placeholder="URL"
            value={draft.sourceUrl}
            onChange={(e) => updateField("sourceUrl", e.target.value)}
            onKeyDown={handleKeyDown}
            type="url"
            {...bookmarkUrlProps}
          />
        )}

        {draft.type === "person" && (
          <>
            <Input
              data-testid="add-dialog-person-email"
              className="col-span-2 h-7 text-xs"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => updateField("email", e.target.value)}
              onKeyDown={handleKeyDown}
              type="email"
            />
            <Input
              data-testid="add-dialog-person-phone"
              className="h-7 text-xs"
              placeholder="Phone"
              value={draft.phoneNumber}
              onChange={(e) => updateField("phoneNumber", e.target.value)}
              onKeyDown={handleKeyDown}
              type="tel"
            />
            <Input
              data-testid="add-dialog-person-role"
              className="h-7 text-xs"
              placeholder="Role"
              value={draft.role}
              onChange={(e) => updateField("role", e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}

        {draft.type === "project" && (
          <>
            <Input
              data-testid="add-dialog-project-status"
              className="h-7 text-xs"
              placeholder="Status"
              value={draft.status}
              onChange={(e) => updateField("status", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              data-testid="add-dialog-project-repo"
              className="h-7 text-xs"
              placeholder="Repository"
              value={draft.repo}
              onChange={(e) => updateField("repo", e.target.value)}
              onKeyDown={handleKeyDown}
              type="url"
            />
            <Input
              data-testid="add-dialog-project-started"
              className="h-7 text-xs"
              type="datetime-local"
              value={draft.started}
              onChange={(e) => updateField("started", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              data-testid="add-dialog-project-goal-end"
              className="h-7 text-xs"
              type="datetime-local"
              value={draft.goalEndDate}
              onChange={(e) => updateField("goalEndDate", e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}

        {draft.type === "event" && (
          <>
            <Input
              data-testid="add-dialog-event-start"
              className="h-7 text-xs"
              type="datetime-local"
              value={draft.startDate}
              onChange={(e) => updateField("startDate", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              data-testid="add-dialog-event-end"
              className="h-7 text-xs"
              type="datetime-local"
              value={draft.endDate}
              onChange={(e) => updateField("endDate", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Input
              data-testid="add-dialog-event-duration"
              className="col-span-2 h-7 text-xs"
              placeholder="Duration (e.g. 2h, 90m)"
              value={draft.duration}
              onChange={(e) => updateField("duration", e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </>
        )}

        {draft.type === "dream" && (
          <Input
            data-testid="add-dialog-dream-mood"
            className="col-span-2 h-7 text-xs"
            placeholder="Mood"
            value={draft.mood}
            onChange={(e) => updateField("mood", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
    </div>
  );
}
