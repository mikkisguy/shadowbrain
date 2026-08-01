import type { ShadowbrainExportV1 } from "./types";

/** JSON Schema for the versioned ShadowBrain import/export envelope. */
export const EXPORT_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://shadowbrain.app/schemas/shadowbrain-export-v1.json",
  title: "ShadowBrain export envelope",
  description:
    "A complete ShadowBrain export that can be imported with merge semantics. Image binaries are not included.",
  type: "object",
  additionalProperties: false,
  required: [
    "format",
    "version",
    "exported_at",
    "items",
    "tags",
    "item_tags",
    "links",
    "journal_periods",
  ],
  properties: {
    format: {
      type: "string",
      const: "shadowbrain-export",
      description: "Identifies this document as a ShadowBrain export.",
    },
    version: {
      type: "integer",
      const: 1,
      description: "Export envelope version. This schema describes version 1.",
    },
    exported_at: {
      type: "string",
      format: "date-time",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
      description:
        "UTC ISO 8601 timestamp (…Z) at which the export was created.",
    },
    items: {
      type: "array",
      maxItems: 50000,
      description: "Content items included in the export.",
      items: { $ref: "#/definitions/item" },
    },
    tags: {
      type: "array",
      maxItems: 50000,
      description: "Tags that can be assigned to exported content items.",
      items: { $ref: "#/definitions/tag" },
    },
    item_tags: {
      type: "array",
      maxItems: 50000,
      description:
        "Assignments connecting content item IDs to tag IDs. Each (content_id, tag_id) pair must be unique.",
      items: { $ref: "#/definitions/item_tag" },
    },
    links: {
      type: "array",
      maxItems: 50000,
      description:
        "Undirected, bidirectional links between content items. Reverse duplicates are ignored on import.",
      items: { $ref: "#/definitions/link" },
    },
    journal_periods: {
      type: "array",
      maxItems: 50000,
      description: "Journal aggregation periods associated with content items.",
      items: { $ref: "#/definitions/journal_period" },
    },
  },
  definitions: {
    item: {
      type: "object",
      additionalProperties: false,
      description: "A content item and its persisted exportable fields.",
      required: [
        "id",
        "type",
        "title",
        "content",
        "image_path",
        "source",
        "source_url",
        "metadata",
        "is_private",
        "is_hidden",
        "created_at",
        "updated_at",
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Stable item identifier.",
        },
        type: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Content type.",
        },
        title: {
          type: ["string", "null"],
          maxLength: 8192,
          description: "Optional item title.",
        },
        content: {
          type: "string",
          maxLength: 1000000,
          description: "Item body content.",
        },
        image_path: {
          type: ["string", "null"],
          maxLength: 8192,
          description:
            "Stored image path, if present. The image binary is not exported.",
        },
        source: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Origin of the item.",
        },
        source_url: {
          type: ["string", "null"],
          maxLength: 8192,
          description: "Optional URL associated with the item.",
        },
        metadata: {
          type: ["object", "null"],
          description:
            "Optional metadata object. Top-level keys ≤ 256 chars and ≤ 64 properties. Nested values are allowed; runtime import additionally enforces ≤ 8 nesting depth and ≤ 64 KiB JSON size.",
          additionalProperties: true,
          propertyNames: { type: "string", maxLength: 256 },
          maxProperties: 64,
        },
        is_private: {
          type: "integer",
          enum: [0, 1],
          description: "Whether the item is private (0 or 1).",
        },
        is_hidden: {
          type: "integer",
          enum: [0, 1],
          description: "Whether the item is hidden (0 or 1).",
        },
        created_at: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 item creation timestamp (…Z).",
        },
        updated_at: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 item update timestamp (…Z).",
        },
      },
    },
    tag: {
      type: "object",
      additionalProperties: false,
      description: "A tag available for assignment to content items.",
      required: ["id", "name", "color", "created_at"],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Stable tag identifier.",
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Tag name.",
        },
        color: {
          type: ["string", "null"],
          maxLength: 8192,
          description: "Optional display color.",
        },
        created_at: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 tag creation timestamp (…Z).",
        },
      },
    },
    item_tag: {
      type: "object",
      additionalProperties: false,
      description: "An assignment of one tag to one content item.",
      required: ["content_id", "tag_id", "created_at"],
      properties: {
        content_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "ID of the tagged content item.",
        },
        tag_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "ID of the assigned tag.",
        },
        created_at: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 assignment creation timestamp (…Z).",
        },
      },
    },
    link: {
      type: "object",
      additionalProperties: false,
      description: "A typed link between two content items.",
      required: [
        "id",
        "source_id",
        "target_id",
        "link_type",
        "context",
        "created_at",
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Stable link identifier.",
        },
        source_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "ID of one linked item.",
        },
        target_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "ID of the other linked item.",
        },
        link_type: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "Type of relationship.",
        },
        context: {
          type: ["string", "null"],
          maxLength: 8192,
          description: "Optional relationship context.",
        },
        created_at: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 link creation timestamp (…Z).",
        },
      },
    },
    journal_period: {
      type: "object",
      additionalProperties: false,
      description: "A journal aggregation period and its generation metadata.",
      required: [
        "content_id",
        "period_start",
        "period_end",
        "raw_count",
        "model_used",
      ],
      properties: {
        content_id: {
          type: "string",
          minLength: 1,
          maxLength: 256,
          description: "ID of the journal content item.",
        },
        period_start: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 start timestamp for the period (…Z).",
        },
        period_end: {
          type: "string",
          format: "date-time",
          pattern:
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$",
          description: "UTC ISO 8601 end timestamp for the period (…Z).",
        },
        raw_count: {
          type: "integer",
          minimum: 0,
          description: "Number of raw entries used to create the journal.",
        },
        model_used: {
          type: ["string", "null"],
          maxLength: 8192,
          description: "Optional model identifier used for generation.",
        },
      },
    },
  },
} as const;

/** Return a small, valid envelope suitable as a starting point for an import. */
export function buildImportTemplate(): ShadowbrainExportV1 {
  const timestamp = "2026-01-01T00:00:00.000Z";

  return {
    format: "shadowbrain-export",
    version: 1,
    exported_at: timestamp,
    items: [
      {
        id: "example-project",
        type: "project",
        title: "Example project",
        content: "A project imported from the ShadowBrain template.",
        image_path: null,
        source: "manual",
        source_url: null,
        metadata: { status: "active" },
        is_private: 0,
        is_hidden: 0,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "example-note",
        type: "note",
        title: "Example note",
        content: "A note related to the example project.",
        image_path: null,
        source: "manual",
        source_url: null,
        metadata: null,
        is_private: 0,
        is_hidden: 0,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    tags: [
      {
        id: "example-tag",
        name: "example",
        color: null,
        created_at: timestamp,
      },
    ],
    item_tags: [
      {
        content_id: "example-note",
        tag_id: "example-tag",
        created_at: timestamp,
      },
    ],
    links: [
      {
        id: "example-link",
        source_id: "example-project",
        target_id: "example-note",
        link_type: "related-to",
        context: "The note belongs to the example project.",
        created_at: timestamp,
      },
    ],
    journal_periods: [],
  };
}

/** Pretty-printed valid example shown in Settings → Data. */
export const IMPORT_GUIDE_EXAMPLE_JSON = JSON.stringify(
  buildImportTemplate(),
  null,
  2
);
