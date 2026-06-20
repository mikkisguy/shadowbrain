import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import { join, sep } from "path";
import { getImagesDir, getImageFullPath, deleteImage } from "@/lib/storage";

const FIXTURE_DIR = "test-fixtures-storage";

describe("getImagesDir", () => {
  it("returns an absolute path ending in /images", () => {
    const dir = getImagesDir();
    expect(dir.endsWith(`${sep}images`)).toBe(true);
  });
});

describe("getImageFullPath", () => {
  beforeAll(async () => {
    await fs.mkdir(join(getImagesDir(), FIXTURE_DIR), { recursive: true });
    await fs.writeFile(join(getImagesDir(), FIXTURE_DIR, "ok.txt"), "hello");
  });

  afterAll(async () => {
    await fs.rm(join(getImagesDir(), FIXTURE_DIR), {
      recursive: true,
      force: true,
    });
  });

  it("resolves a relative path inside the images directory", () => {
    const full = getImageFullPath(`${FIXTURE_DIR}/ok.txt`);
    expect(full).toBe(join(getImagesDir(), FIXTURE_DIR, "ok.txt"));
  });

  it("resolves a single-segment path", () => {
    const full = getImageFullPath("lonely.png");
    expect(full).toBe(join(getImagesDir(), "lonely.png"));
  });

  it("rejects path traversal with ..", () => {
    expect(() => getImageFullPath(`../../../etc/passwd`)).toThrow(
      /path traversal detected/
    );
  });

  it("rejects path traversal embedded in a deeper segment", () => {
    // The whole segment decodes to an escape path; containment
    // check is the hard guarantee.
    expect(() => getImageFullPath(`${FIXTURE_DIR}/../../etc/passwd`)).toThrow(
      /path traversal detected/
    );
  });

  it("rejects an absolute path that escapes the images dir", () => {
    expect(() => getImageFullPath("/etc/passwd")).toThrow(
      /path traversal detected/
    );
  });

  it("accepts a path that contains .. as a non-traversal component", () => {
    // A segment literally named "..foo" or "foo..bar" is not a
    // directory escape; it is just a filename with dots. The
    // containment check should not reject it.
    const full = getImageFullPath(`${FIXTURE_DIR}/..weird..name.txt`);
    expect(full.startsWith(getImagesDir())).toBe(true);
  });
});

describe("deleteImage", () => {
  const FILENAME = `${FIXTURE_DIR}/deleteme.txt`;

  beforeAll(async () => {
    await fs.mkdir(join(getImagesDir(), FIXTURE_DIR), { recursive: true });
    await fs.writeFile(join(getImagesDir(), FILENAME), "bye");
  });

  afterAll(async () => {
    await fs.rm(join(getImagesDir(), FIXTURE_DIR), {
      recursive: true,
      force: true,
    });
  });

  it("removes an existing file and returns true", async () => {
    expect(await deleteImage(FILENAME)).toBe(true);
    await expect(fs.access(join(getImagesDir(), FILENAME))).rejects.toThrow();
  });

  it("returns false for a missing file", async () => {
    expect(await deleteImage(FILENAME)).toBe(false);
  });

  it("rejects path traversal", async () => {
    await expect(deleteImage(`../../../etc/passwd`)).rejects.toThrow(
      /path traversal detected/
    );
  });
});
