import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

function mockBaseDeps() {
  vi.doMock("@/db/index", () => ({
    getDb: () => ({}) as object,
  }));
  vi.doMock("@/lib/backup/reminder", () => ({
    readBackupStatus: () => ({
      lastBackupAt: null,
      snoozeCount: 0,
      daysSince: null,
      severity: "enforce" as const,
    }),
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("/backup page", () => {
  it("renders explicit config error when backup guide config is invalid", async () => {
    mockBaseDeps();
    vi.doMock("@/lib/backup/guide-config", () => ({
      readBackupGuideConfig: () => ({
        ok: false as const,
        errors: ["BACKUP_DOCKER_VOLUME: Invalid input"],
      }),
      buildBackupScript: () => "unused",
    }));

    const { default: BackupPage } = await import("@/app/backup/page");
    const html = renderToStaticMarkup(<BackupPage />);

    expect(html).toMatch(/Backup guide is misconfigured/);
    expect(html).toMatch(/BACKUP_DOCKER_VOLUME/);
  });

  it("renders the guide when backup guide config is valid", async () => {
    mockBaseDeps();
    vi.doMock("@/lib/backup/guide-config", () => ({
      readBackupGuideConfig: () => ({
        ok: true as const,
        config: {
          dockerVolume: "shadowbrain_data",
          tmpDir: "/tmp",
          protonFolder: "/ShadowBrain Backups",
        },
      }),
      buildBackupScript: () => "#!/usr/bin/env bash\necho ok",
    }));
    vi.doMock("./backup-guide", () => ({
      BackupGuide: () => <div data-testid="backup-guide-rendered" />,
    }));

    const { default: BackupPage } = await import("@/app/backup/page");
    const html = renderToStaticMarkup(<BackupPage />);

    expect(html).toMatch(/data-testid="backup-guide-rendered"/);
  });
});
