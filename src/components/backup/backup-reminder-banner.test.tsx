// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BackupReminderBanner } from "./backup-reminder-banner";

const pathnameState = { value: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("BackupReminderBanner enforce mode", () => {
  it("renders nothing when backup is within the hidden window", () => {
    pathnameState.value = "/";
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { container } = render(
      <BackupReminderBanner
        initialStatus={{
          lastBackupAt: threeDaysAgo,
          snoozeCount: 0,
          daysSince: 3,
          severity: "hidden",
        }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a blocking enforce dialog on non-/backup routes", () => {
    pathnameState.value = "/";
    const twentyDaysAgo = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000
    ).toISOString();

    render(
      <BackupReminderBanner
        initialStatus={{
          lastBackupAt: twentyDaysAgo,
          snoozeCount: 0,
          daysSince: 20,
          severity: "enforce",
        }}
      />
    );

    expect(screen.getByText("Back up your data")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark as backed up" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Snooze 1 day" })
    ).toBeInTheDocument();
  });

  it("hides the snooze action once snooze limit is reached", () => {
    pathnameState.value = "/";
    const twentyDaysAgo = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000
    ).toISOString();

    render(
      <BackupReminderBanner
        initialStatus={{
          lastBackupAt: twentyDaysAgo,
          snoozeCount: 3,
          daysSince: 20,
          severity: "enforce",
        }}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Snooze 1 day" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("You have snoozed 3 times — please run a backup now.")
    ).toBeInTheDocument();
  });
});
