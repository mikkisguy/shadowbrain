import type { ContentItem } from "@/db/repositories/content-items";
import type { ContentLink } from "@/db/repositories/content-links";
import type { ContentTagRow } from "@/db/repositories/content-tags";
import type { JournalPeriod } from "@/db/repositories/journal-periods";
import type { Tag } from "@/db/repositories/tags";

export interface ShadowbrainExportItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  is_private: 0 | 1;
  is_hidden: 0 | 1;
  created_at: string;
  updated_at: string;
}

interface ShadowbrainExportTag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

interface ShadowbrainExportItemTag {
  content_id: string;
  tag_id: string;
  created_at: string;
}

interface ShadowbrainExportLink {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  context: string | null;
  created_at: string;
}

interface ShadowbrainExportJournalPeriod {
  content_id: string;
  period_start: string;
  period_end: string;
  raw_count: number;
  model_used: string | null;
}

export interface ShadowbrainExportV1 {
  format: "shadowbrain-export";
  version: 1;
  exported_at: string;
  items: ShadowbrainExportItem[];
  tags: ShadowbrainExportTag[];
  item_tags: ShadowbrainExportItemTag[];
  links: ShadowbrainExportLink[];
  journal_periods: ShadowbrainExportJournalPeriod[];
}

export interface ShadowbrainExportInput {
  items: ContentItem[];
  tags: Tag[];
  itemTags: ContentTagRow[];
  links: ContentLink[];
  journalPeriods: JournalPeriod[];
  exportedAt?: string;
}
