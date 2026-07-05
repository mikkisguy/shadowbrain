/**
 * Metadata ↔ draft conversion helpers.
 *
 * The backend stores type-specific fields as a JSON `metadata` column.
 * The draft uses flat camelCase field names. These helpers bridge the
 * two representations so both the add and edit forms can share the
 * same conversion logic.
 *
 * Extracted from `edit-dialog.tsx` lines 112–177.
 */

import type { Draft } from "./types";

/** Parse metadata JSON into a flat record keyed by the draft field names. */
export function metadataToDraftFields(
  type: string,
  metadata: string | null
): Partial<Draft> {
  if (!metadata) return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return {};
  }

  const fields: Partial<Draft> = {};
  if (type === "person") {
    if (typeof parsed.email === "string") fields.email = parsed.email;
    if (typeof parsed.phone_number === "string")
      fields.phoneNumber = parsed.phone_number;
    if (typeof parsed.role === "string") fields.role = parsed.role;
  }
  if (type === "project") {
    if (typeof parsed.status === "string") fields.status = parsed.status;
    if (typeof parsed.repo === "string") fields.repo = parsed.repo;
    if (typeof parsed.started === "string") fields.started = parsed.started;
    if (typeof parsed.goal_end_date === "string")
      fields.goalEndDate = parsed.goal_end_date;
  }
  if (type === "event") {
    if (typeof parsed.start_date === "string")
      fields.startDate = parsed.start_date;
    if (typeof parsed.end_date === "string") fields.endDate = parsed.end_date;
    if (
      typeof parsed.duration === "string" ||
      typeof parsed.duration === "number"
    )
      fields.duration = String(parsed.duration);
  }
  if (type === "dream") {
    if (typeof parsed.mood === "string") fields.mood = parsed.mood;
  }
  return fields;
}

/** Convert draft type-specific fields back to a metadata object for the API.
 *  Returns null when no type-specific fields are populated. */
export function draftToMetadata(draft: Draft): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (draft.type === "person") {
    if (draft.email.trim()) meta.email = draft.email;
    if (draft.phoneNumber.trim()) meta.phone_number = draft.phoneNumber;
    if (draft.role.trim()) meta.role = draft.role;
  }
  if (draft.type === "project") {
    if (draft.status.trim()) meta.status = draft.status;
    if (draft.repo.trim()) meta.repo = draft.repo;
    if (draft.started) meta.started = draft.started;
    if (draft.goalEndDate) meta.goal_end_date = draft.goalEndDate;
  }
  if (draft.type === "event") {
    if (draft.startDate) meta.start_date = draft.startDate;
    if (draft.endDate) meta.end_date = draft.endDate;
    if (draft.duration.trim()) meta.duration = draft.duration;
  }
  if (draft.type === "dream") {
    if (draft.mood.trim()) meta.mood = draft.mood;
  }
  return Object.keys(meta).length > 0 ? meta : null;
}
