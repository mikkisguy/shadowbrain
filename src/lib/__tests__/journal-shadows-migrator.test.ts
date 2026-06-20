import { describe, it, expect } from "vitest";
import {
  mapJournalEntry,
  mapRawEntry,
  mapNoteName,
  mapJournalPeriod,
  mapSettings,
  noteIdForPath,
  normalizeToUtcIso,
  LEGACY_SOURCE,
  type LegacyJournalEntry,
  type LegacyRawEntry,
  type LegacyNoteName,
  type LegacySetting,
} from "@/lib/journal-shadows-migrator";

describe("LEGACY_SOURCE", () => {
  it("is the stable source label", () => {
    expect(LEGACY_SOURCE).toBe("journal-shadows");
  });
});

describe("normalizeToUtcIso", () => {
  it("appends Z to a no-TZ string and emits canonical UTC", () => {
    expect(normalizeToUtcIso("2026-02-23 21:32:14")).toBe(
      "2026-02-23T21:32:14.000Z"
    );
  });

  it("appends Z to a no-TZ date-only string", () => {
    expect(normalizeToUtcIso("2026-02-23")).toBe("2026-02-23T00:00:00.000Z");
  });

  it("re-emits an already-Z string in canonical form", () => {
    expect(normalizeToUtcIso("2026-02-25T06:58:28.348Z")).toBe(
      "2026-02-25T06:58:28.348Z"
    );
  });

  it("respects an explicit numeric offset", () => {
    // 2026-02-23 21:32:14+03:00 == 2026-02-23 18:32:14 UTC
    expect(normalizeToUtcIso("2026-02-23 21:32:14+03:00")).toBe(
      "2026-02-23T18:32:14.000Z"
    );
  });

  it("returns the input verbatim when unparseable", () => {
    expect(normalizeToUtcIso("not a date")).toBe("not a date");
    expect(normalizeToUtcIso("")).toBe("");
  });
});

describe("mapJournalEntry", () => {
  it("preserves id, title, content, and timestamps", () => {
    const row: LegacyJournalEntry = {
      id: "je-1",
      date: "2026-02-23",
      content: "Hello journal",
      period_start: "2026-02-23 04:00:00",
      period_end: "2026-02-23 21:32:14",
      created_at: "2026-02-23 21:32:14",
      updated_at: "2026-02-24 13:25:08",
      title: "First Steps",
    };
    const out = mapJournalEntry(row);

    expect(out.id).toBe("je-1");
    expect(out.type).toBe("journal");
    expect(out.title).toBe("First Steps");
    expect(out.content).toBe("Hello journal");
    expect(out.source).toBe(LEGACY_SOURCE);
    // created_at/updated_at are normalised to UTC ISO so the dest
    // DB has a single canonical timestamp format.
    expect(out.created_at).toBe("2026-02-23T21:32:14.000Z");
    expect(out.updated_at).toBe("2026-02-24T13:25:08.000Z");
    // Period timestamps do NOT live on the content_item — they're
    // emitted separately as a journal_periods row.
    expect(out.image_path).toBeNull();
    expect(out.is_private).toBe(0);
  });

  it("stores the legacy `date` in metadata so the day survives", () => {
    const row: LegacyJournalEntry = {
      id: "je-1",
      date: "2026-02-23",
      content: "x",
      period_start: null,
      period_end: null,
      created_at: "2026-02-23T00:00:00.000Z",
      updated_at: "2026-02-23T00:00:00.000Z",
      title: null,
    };
    const out = mapJournalEntry(row);
    expect(JSON.parse(out.metadata!)).toEqual({ legacy_date: "2026-02-23" });
  });

  it("handles a null title without error", () => {
    const row: LegacyJournalEntry = {
      id: "je-1",
      date: "2026-02-23",
      content: "x",
      period_start: null,
      period_end: null,
      created_at: "2026-02-23T00:00:00.000Z",
      updated_at: "2026-02-23T00:00:00.000Z",
      title: null,
    };
    expect(mapJournalEntry(row).title).toBeNull();
  });
});

describe("mapRawEntry", () => {
  it("maps type='text' to 'raw_text'", () => {
    const row: LegacyRawEntry = {
      id: "re-1",
      content: "hello",
      type: "text",
      image_path: null,
      created_at: "2026-02-23T20:56:26.000Z",
    };
    const out = mapRawEntry(row);
    expect(out.id).toBe("re-1");
    expect(out.type).toBe("raw_text");
    expect(out.content).toBe("hello");
    expect(out.image_path).toBeNull();
    expect(out.updated_at).toBe(row.created_at);
    expect(out.metadata).toBeNull();
  });

  it("maps type='image' and preserves image_path", () => {
    const row: LegacyRawEntry = {
      id: "re-2",
      content: "",
      type: "image",
      image_path: "2026-02/abc.webp",
      created_at: "2026-02-23T21:00:08.000Z",
    };
    const out = mapRawEntry(row);
    expect(out.type).toBe("image");
    expect(out.image_path).toBe("2026-02/abc.webp");
  });

  it("falls back to 'raw_text' for unknown types and records the original", () => {
    const row: LegacyRawEntry = {
      id: "re-3",
      content: "x",
      type: "voice_memo",
      image_path: null,
      created_at: "2026-02-23T00:00:00.000Z",
    };
    const out = mapRawEntry(row);
    expect(out.type).toBe("raw_text");
    expect(JSON.parse(out.metadata!)).toEqual({ legacy_type: "voice_memo" });
  });
});

describe("noteIdForPath", () => {
  it("is deterministic", () => {
    expect(noteIdForPath("notes/a.md")).toBe(noteIdForPath("notes/a.md"));
  });

  it("is uuid-shaped with the 'note-md-' prefix", () => {
    expect(noteIdForPath("foo.md")).toMatch(/^note-md-[0-9a-f]{32}$/);
  });

  it("matches the markdown importer's id scheme", async () => {
    // The markdown importer uses the same hash → the legacy `note_names`
    // rows and the corresponding `.md` files must collide on the same
    // id, otherwise we'd double-import.
    const { generateStableId } = await import("@/lib/markdown-importer");
    expect(noteIdForPath("notes/a.md")).toBe(generateStableId("notes/a.md"));
  });
});

describe("mapNoteName", () => {
  it("uses the stable id, display_name as title, and stores the path in metadata", () => {
    const row: LegacyNoteName = {
      path: "general/github-copilot-ai-model-workflow.md",
      display_name: "GitHub Copilot AI Model Workflow",
      created_at: "2026-03-08T11:50:11.280Z",
      updated_at: "2026-03-08T11:50:11.280Z",
    };
    const out = mapNoteName(row);
    expect(out.id).toBe(noteIdForPath(row.path));
    expect(out.type).toBe("note");
    expect(out.title).toBe("GitHub Copilot AI Model Workflow");
    // Body content lives in the .md file — populated by a separate
    // UPDATE after the row is created.
    expect(out.content).toBe("");
    expect(JSON.parse(out.metadata!)).toEqual({
      path: "general/github-copilot-ai-model-workflow.md",
    });
    expect(out.created_at).toBe(row.created_at);
    expect(out.updated_at).toBe(row.updated_at);
  });
});

describe("mapJournalPeriod", () => {
  const raws: LegacyRawEntry[] = [
    {
      id: "r1",
      content: "a",
      type: "text",
      image_path: null,
      created_at: "2026-02-23T05:00:00.000Z",
    },
    {
      id: "r2",
      content: "b",
      type: "text",
      image_path: null,
      created_at: "2026-02-23T10:00:00.000Z",
    },
    {
      id: "r3",
      content: "c",
      type: "image",
      image_path: "x.webp",
      created_at: "2026-02-23T20:00:00.000Z",
    },
    // Out of period (before start) — must NOT be counted.
    {
      id: "r4",
      content: "d",
      type: "text",
      image_path: null,
      created_at: "2026-02-23T03:59:00.000Z",
    },
    // Out of period (after end) — must NOT be counted.
    {
      id: "r5",
      content: "e",
      type: "text",
      image_path: null,
      created_at: "2026-02-23T21:33:00.000Z",
    },
  ];

  it("counts raw entries whose created_at falls inside [period_start, period_end]", () => {
    const out = mapJournalPeriod(
      "je-1",
      "2026-02-23T04:00:00.000Z",
      "2026-02-23T21:32:14.000Z",
      raws
    );
    expect(out.content_id).toBe("je-1");
    expect(out.raw_count).toBe(3);
    expect(out.model_used).toBeNull();
    expect(out.period_start).toBe("2026-02-23T04:00:00.000Z");
    expect(out.period_end).toBe("2026-02-23T21:32:14.000Z");
  });

  it("is inclusive on both ends", () => {
    const out = mapJournalPeriod(
      "je-1",
      "2026-02-23T05:00:00.000Z",
      "2026-02-23T10:00:00.000Z",
      raws
    );
    expect(out.raw_count).toBe(2);
  });

  it("ignores raws with unparseable timestamps", () => {
    const out = mapJournalPeriod(
      "je-1",
      "2026-02-23T04:00:00.000Z",
      "2026-02-23T21:32:14.000Z",
      [
        ...raws,
        {
          id: "bad",
          content: "x",
          type: "text",
          image_path: null,
          created_at: "not a date",
        },
      ]
    );
    expect(out.raw_count).toBe(3);
  });

  it("returns raw_count=0 for an empty raw list", () => {
    const out = mapJournalPeriod(
      "je-1",
      "2026-02-23T04:00:00.000Z",
      "2026-02-23T21:32:14.000Z",
      []
    );
    expect(out.raw_count).toBe(0);
  });

  it("is timezone-independent: no-TZ timestamps are treated as UTC", () => {
    // Both ends are no-TZ (legacy app wrote them as UTC without the
    // Z marker). A naive Date.parse in a non-UTC container would
    // miscount raws that have explicit Z markers. We assert the
    // helper normalises both sides so the count is stable.
    const raws: LegacyRawEntry[] = [
      {
        id: "r1",
        content: "a",
        type: "text",
        image_path: null,
        created_at: "2026-02-23 05:00:00", // no TZ
      },
      {
        id: "r2",
        content: "b",
        type: "text",
        image_path: null,
        created_at: "2026-02-23T10:00:00.000Z", // Z-suffixed
      },
      {
        id: "r3",
        content: "c",
        type: "text",
        image_path: null,
        created_at: "2026-02-23T20:00:00.000Z",
      },
    ];
    const out = mapJournalPeriod(
      "je-1",
      "2026-02-23 04:00:00",
      "2026-02-23 21:32:14",
      raws
    );
    expect(out.raw_count).toBe(3);
    // Period start/end are also normalised on the way out so the
    // dest DB has a single canonical format.
    expect(out.period_start).toBe("2026-02-23T04:00:00.000Z");
    expect(out.period_end).toBe("2026-02-23T21:32:14.000Z");
  });
});

describe("mapSettings", () => {
  it("drops password_hash and any *_api_key", () => {
    const rows: LegacySetting[] = [
      { key: "password_hash", value: "scrypt$..." },
      { key: "openrouter_api_key", value: "sk-or-..." },
      { key: "groq_api_key", value: "gsk-..." },
      { key: "ollama_url", value: "http://localhost:11434" },
      { key: "ai_model", value: "qwen/qwen3-235b-a22b-2507" },
      { key: "ai_provider", value: "openrouter" },
    ];
    const { kept, dropped } = mapSettings(rows);

    expect(kept).toEqual([
      { key: "ai_model", value: "qwen/qwen3-235b-a22b-2507" },
      { key: "ai_provider", value: "openrouter" },
    ]);
    expect(dropped.map((d) => d.key).sort()).toEqual(
      [
        "groq_api_key",
        "ollama_url",
        "openrouter_api_key",
        "password_hash",
      ].sort()
    );
    for (const d of dropped) {
      expect(d.reason).toMatch(/not migrated/i);
    }
  });

  it("preserves non-blocked keys verbatim", () => {
    const { kept, dropped } = mapSettings([
      { key: "hermes_discord_last_message_id", value: "1501608239786098809" },
    ]);
    expect(kept).toEqual([
      { key: "hermes_discord_last_message_id", value: "1501608239786098809" },
    ]);
    expect(dropped).toEqual([]);
  });

  it("returns empty arrays for an empty input", () => {
    expect(mapSettings([])).toEqual({ kept: [], dropped: [] });
  });

  it("never leaks a dropped value through the `kept` array", () => {
    const { kept } = mapSettings([
      { key: "password_hash", value: "super-secret" },
      { key: "openrouter_api_key", value: "another-secret" },
    ]);
    const blob = JSON.stringify(kept);
    expect(blob).not.toContain("super-secret");
    expect(blob).not.toContain("another-secret");
  });
});
