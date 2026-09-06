import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAssistStore } from "@/assist/assistStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { MobileTopBar } from "./MobileTopBar";

beforeEach(() => {
  useEditorStore.getState().resetEditor();
  useProjectStore.setState({
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
    project: null,
    activeAlgorithm: "crossfade",
  });
  useAssistStore.setState({ launcherOpen: false });
});

describe("MobileTopBar commands", () => {
  it("keeps the overflow menu stacking context above the workspace", () => {
    render(<MobileTopBar onOpenInspector={() => {}} />);

    expect(screen.getByRole("banner")).toHaveClass("z-40");
  });

  it("opens the real Demo dialog state from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<MobileTopBar onOpenInspector={() => {}} />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Demo" }));

    expect(useEditorStore.getState().demoDialogOpen).toBe(true);
  });

  it("opens the Export dialog state from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<MobileTopBar onOpenInspector={() => {}} />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(useEditorStore.getState().exportDialogOpen).toBe(true);
  });

  it("opens the contextual assistant from Help", async () => {
    const user = userEvent.setup();
    render(<MobileTopBar onOpenInspector={() => {}} />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Help" }));

    expect(useAssistStore.getState().launcherOpen).toBe(true);
  });
});
