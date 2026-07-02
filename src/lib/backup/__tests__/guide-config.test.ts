import { describe, expect, it } from "vitest";

import {
  buildBackupScript,
  readBackupGuideConfig,
} from "@/lib/backup/guide-config";

describe("readBackupGuideConfig", () => {
  it("returns parsed config when all required env keys are present", () => {
    const result = readBackupGuideConfig({
      BACKUP_DOCKER_VOLUME: "shadowbrain_data",
      BACKUP_TMP_DIR: "/tmp",
      BACKUP_PROTON_FOLDER: "/ShadowBrain Backups",
    });

    expect(result).toEqual({
      ok: true,
      config: {
        dockerVolume: "shadowbrain_data",
        tmpDir: "/tmp",
        protonFolder: "/ShadowBrain Backups",
      },
    });
  });

  it("returns validation errors when required env keys are missing", () => {
    const result = readBackupGuideConfig({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("BACKUP_DOCKER_VOLUME"),
        expect.stringContaining("BACKUP_TMP_DIR"),
        expect.stringContaining("BACKUP_PROTON_FOLDER"),
      ])
    );
  });
});

describe("buildBackupScript", () => {
  it("renders a copy-ready script with concrete configured values", () => {
    const script = buildBackupScript({
      dockerVolume: "shadowbrain_data",
      tmpDir: "/tmp",
      protonFolder: "/ShadowBrain Backups",
    });

    expect(script).toContain("-v 'shadowbrain_data':/data:ro");
    expect(script).toContain("SNAPSHOT_DIR='/tmp'");
    expect(script).toContain(
      "proton-drive filesystem upload \"$SNAPSHOT\" '/ShadowBrain Backups/'"
    );
    expect(script).toContain(
      "proton-drive filesystem list '/ShadowBrain Backups/'"
    );
  });
});
