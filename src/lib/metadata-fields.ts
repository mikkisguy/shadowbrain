export type MetadataField = {
  label: string;
  value: string;
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
        fields.push({ label: "Status", value: status.trim() });
      }
      const repo = parsed.repo;
      if (typeof repo === "string" && repo.trim()) {
        fields.push({ label: "Repository", value: repo.trim() });
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
    default:
      return null;
  }

  return fields.length > 0 ? fields : null;
}
