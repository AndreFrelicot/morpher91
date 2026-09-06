import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DESKTOP_GATE_STORAGE_KEY, DesktopOnlyGate } from "./DesktopOnlyGate";

beforeEach(() => {
  sessionStorage.clear();
});

describe("DesktopOnlyGate", () => {
  it("hides the mobile shell behind a desktop-only notice", () => {
    render(
      <DesktopOnlyGate>
        <p>mobile shell</p>
      </DesktopOnlyGate>,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Mobile use is not supported",
    );
    expect(screen.queryByText("mobile shell")).toBeNull();
  });

  it("reveals the shell on 'Continue anyway' and remembers it for the session", async () => {
    const user = userEvent.setup();
    render(
      <DesktopOnlyGate>
        <p>mobile shell</p>
      </DesktopOnlyGate>,
    );

    await user.click(screen.getByRole("button", { name: /Continue anyway/ }));

    expect(screen.getByText("mobile shell")).toBeInTheDocument();
    expect(sessionStorage.getItem(DESKTOP_GATE_STORAGE_KEY)).toBe("1");
  });

  it("skips the notice when the session already dismissed it", () => {
    sessionStorage.setItem(DESKTOP_GATE_STORAGE_KEY, "1");
    render(
      <DesktopOnlyGate>
        <p>mobile shell</p>
      </DesktopOnlyGate>,
    );

    expect(screen.getByText("mobile shell")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
