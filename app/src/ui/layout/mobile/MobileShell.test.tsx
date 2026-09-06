import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAssistStore } from "@/assist/assistStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { MobileShell } from "./MobileShell";

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
  useAssistStore.setState({
    launcherOpen: false,
    activeGuideId: null,
    stepIndex: 0,
    stepSatisfied: false,
  });
});

describe("MobileShell project surfaces", () => {
  it("mounts and opens the contextual assistant from Help", async () => {
    const user = userEvent.setup();
    render(<MobileShell />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Help" }));

    expect(
      await screen.findByRole("dialog", {
        name: "What do you want to do?",
      }),
    ).toBeInTheDocument();
  });

  it("mounts and opens the Demo assets dialog", async () => {
    const user = userEvent.setup();
    render(<MobileShell />);

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Demo" }));

    expect(
      await screen.findByRole("dialog", { name: "Demo assets" }),
    ).toHaveAccessibleDescription(
      "Pick two images or videos to fill Source A and Target B.",
    );
  });
});
