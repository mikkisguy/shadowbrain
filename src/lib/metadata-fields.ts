import {
  WORKFLOW_STATUS_ITEMS,
  workflowStatusLabel,
} from "@/lib/workflow-status";

export type MetadataField = {
  label: string;
  value: string;
  /** When set, the value renders as an external link. */
  href?: string;
};

/** Parsed bookmark metadata for rich display (images, description, site). */
export interface BookmarkMeta {
  favicon: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
}

/** Parse a bookmark's stored metadata JSON into a typed object. */
export function parseBookmarkMeta(
  metadata: string | null
): BookmarkMeta | null {
  if (!metadata) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  return {
    favicon: typeof parsed.favicon === "string" ? parsed.favicon : null,
    image: typeof parsed.image === "string" ? parsed.image : null,
    description:
      typeof parsed.description === "string" ? parsed.description : null,
    siteName: typeof parsed.site_name === "string" ? parsed.site_name : null,
  };
}

export { workflowStatusLabel };

/**
 * Humanize a freeform or workflow status token for display.
 * Known workflow values use their canonical labels; snake/kebab
 * tokens become Title Case (`in_progress` → `In Progress`).
 */
export function humanizeStatus(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const known = WORKFLOW_STATUS_ITEMS[trimmed];
  if (known) return known;
  return trimmed
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build an absolute href for a repository field. Accepts full URLs or
 * bare host paths like `github.com/acme/repo`. Returns undefined when
 * the value does not look linkable.
 */
export function repoHref(repo: string): string | undefined {
  const trimmed = repo.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Bare host / host/path — common for GitHub-style repo fields.
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[\w./-]*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return undefined;
}

export function extractMetadataFields(
  type: string,
  metadata: string | null,
  formatDate: (iso: string) => string
): MetadataField[] | null {
  if (!metadata) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (Object.keys(parsed).length === 0) return null;

  const fields: MetadataField[] = [];

  switch (type) {
    case "bookmark": {
      const description = parsed.description;
      if (typeof description === "string" && description.trim()) {
        fields.push({ label: "Description", value: description.trim() });
      }
      const siteName = parsed.site_name;
      if (typeof siteName === "string" && siteName.trim()) {
        fields.push({ label: "Site", value: siteName.trim() });
      }
      const autoFetch = parsed.auto_fetch;
      if (autoFetch && typeof autoFetch === "object") {
        const af = autoFetch as Record<string, unknown>;
        if (af.status === "error") {
          fields.push({
            label: "Auto-fetch",
            value: `Failed: ${String(af.reason ?? "unknown")}`,
          });
        }
      }
      break;
    }
    case "person": {
      const email = parsed.email;
      if (typeof email === "string" && email.trim()) {
        fields.push({ label: "Email", value: email.trim() });
      }
      const phoneNumber = parsed.phone_number;
      if (typeof phoneNumber === "string" && phoneNumber.trim()) {
        fields.push({ label: "Phone", value: phoneNumber.trim() });
      }
      const socialLinks = parsed.social_links;
      if (Array.isArray(socialLinks) && socialLinks.length > 0) {
        fields.push({
          label: "Social links",
          value: socialLinks.join(", "),
        });
      }
      const role = parsed.role;
      if (typeof role === "string" && role.trim()) {
        fields.push({ label: "Role", value: role.trim() });
      }
      break;
    }
    case "project": {
      const status = parsed.status;
      if (typeof status === "string" && status.trim()) {
        fields.push({
          label: "Status",
          value: humanizeStatus(status),
        });
      }
      const repo = parsed.repo;
      if (typeof repo === "string" && repo.trim()) {
        const value = repo.trim();
        fields.push({
          label: "Repository",
          value,
          href: repoHref(value),
        });
      }
      const started = parsed.started;
      if (typeof started === "string" && started.trim()) {
        fields.push({ label: "Started", value: formatDate(started) });
      }
      const goalEndDate = parsed.goal_end_date;
      if (typeof goalEndDate === "string" && goalEndDate.trim()) {
        fields.push({
          label: "Goal end date",
          value: formatDate(goalEndDate),
        });
      }
      break;
    }
    case "event": {
      const status = parsed.status;
      if (typeof status === "string" && status.trim()) {
        fields.push({
          label: "Status",
          value: workflowStatusLabel(status.trim()),
        });
      } else {
        fields.push({ label: "Status", value: "To Do" });
      }
      const startDate = parsed.start_date;
      if (typeof startDate === "string" && startDate.trim()) {
        fields.push({ label: "Start", value: formatDate(startDate) });
      }
      const endDate = parsed.end_date;
      if (typeof endDate === "string" && endDate.trim()) {
        fields.push({ label: "End", value: formatDate(endDate) });
      }
      const duration = parsed.duration;
      if (duration !== null && duration !== undefined) {
        fields.push({ label: "Duration", value: String(duration) });
      }
      break;
    }
    case "dream": {
      const mood = parsed.mood;
      if (typeof mood === "string" && mood.trim()) {
        fields.push({ label: "Mood", value: mood.trim() });
      }
      break;
    }
    case "task": {
      const status = parsed.status;
      if (typeof status === "string" && status.trim()) {
        fields.push({
          label: "Status",
          value: workflowStatusLabel(status.trim()),
        });
      } else {
        fields.push({ label: "Status", value: "To Do" });
      }
      const dueDate = parsed.due_date;
      if (typeof dueDate === "string" && dueDate.trim()) {
        fields.push({ label: "Due", value: formatDate(dueDate) });
      }
      const startDate = parsed.start_date;
      if (typeof startDate === "string" && startDate.trim()) {
        fields.push({ label: "Start", value: formatDate(startDate) });
      }
      const endDate = parsed.end_date;
      if (typeof endDate === "string" && endDate.trim()) {
        fields.push({ label: "End", value: formatDate(endDate) });
      }
      break;
    }
    default:
      return null;
  }

  return fields.length > 0 ? fields : null;
}
