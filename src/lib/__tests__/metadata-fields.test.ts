import { describe, expect, it } from "vitest";

import {
  extractMetadataFields,
  humanizeStatus,
  repoHref,
} from "@/lib/metadata-fields";

describe("humanizeStatus", () => {
  it("uses canonical workflow labels", () => {
    expect(humanizeStatus("todo")).toBe("To Do");
    expect(humanizeStatus("in_progress")).toBe("In Progress");
    expect(humanizeStatus("done")).toBe("Done");
  });

  it("title-cases freeform snake/kebab tokens", () => {
    expect(humanizeStatus("active")).toBe("Active");
    expect(humanizeStatus("on_hold")).toBe("On Hold");
    expect(humanizeStatus("pre-launch")).toBe("Pre Launch");
  });
});

describe("repoHref", () => {
  it("passes through absolute http(s) URLs", () => {
    expect(repoHref("https://github.com/acme/repo")).toBe(
      "https://github.com/acme/repo"
    );
  });

  it("prefixes bare host paths with https://", () => {
    expect(repoHref("github.com/acme/harborlight-mobile")).toBe(
      "https://github.com/acme/harborlight-mobile"
    );
  });

  it("returns undefined for non-linkable values", () => {
    expect(repoHref("acme/harborlight-mobile")).toBeUndefined();
    expect(repoHref("local-checkout")).toBeUndefined();
    expect(repoHref("")).toBeUndefined();
  });
});

describe("extractMetadataFields project polish", () => {
  it("humanizes status and attaches a repository href", () => {
    const fields = extractMetadataFields(
      "project",
      JSON.stringify({
        status: "in_progress",
        repo: "github.com/acme/harborlight-mobile",
      }),
      (iso) => iso
    );

    expect(fields).toEqual([
      { label: "Status", value: "In Progress" },
      {
        label: "Repository",
        value: "github.com/acme/harborlight-mobile",
        href: "https://github.com/acme/harborlight-mobile",
      },
    ]);
  });
});
