import type { Draft } from "@/lib/add-form/types";
import { metadataToDraftFields } from "@/lib/add-form/metadata-helpers";
import type { ContentItem, Tag } from "@/db/index";

export interface EditDraft extends Draft {
  source: string;
  is_private: number;
  is_hidden: number;
  tags: string[];
}

/** Build an initial draft from an item's data. */
export function draftFromItem(item: ContentItem, tags: Tag[]): EditDraft {
  const meta = metadataToDraftFields(item.type, item.metadata);
  return {
    type: item.type,
    title: item.title ?? "",
    content: item.content,
    sourceUrl: item.source_url ?? "",
    source: item.source,
    is_private: item.is_private,
    is_hidden: item.is_hidden,
    tags: tags.map((t) => t.name),
    email: meta.email ?? "",
    phoneNumber: meta.phoneNumber ?? "",
    role: meta.role ?? "",
    status: meta.status ?? "",
    repo: meta.repo ?? "",
    started: meta.started ?? "",
    goalEndDate: meta.goalEndDate ?? "",
    startDate: meta.startDate ?? "",
    endDate: meta.endDate ?? "",
    duration: meta.duration ?? "",
    mood: meta.mood ?? "",
    imageUrl: "",
  };
}

/** Deep compare two drafts for unsaved-changes detection. */
export function draftsEqual(a: EditDraft, b: EditDraft): boolean {
  return (
    a.type === b.type &&
    a.title === b.title &&
    a.content === b.content &&
    a.sourceUrl === b.sourceUrl &&
    a.source === b.source &&
    a.is_private === b.is_private &&
    a.is_hidden === b.is_hidden &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i]) &&
    a.email === b.email &&
    a.phoneNumber === b.phoneNumber &&
    a.role === b.role &&
    a.status === b.status &&
    a.repo === b.repo &&
    a.started === b.started &&
    a.goalEndDate === b.goalEndDate &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.duration === b.duration &&
    a.mood === b.mood
  );
}
