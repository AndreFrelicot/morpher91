import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { MobileViewSwitcher } from "./MobileViewSwitcher";

vi.mock("@/features/editor/FeaturePane", () => ({
  FeaturePane: ({ slot }: { slot: string }) => <div>{`pane-${slot}`}</div>,
}));

vi.mock("@/features/editor/MorphCanvas", () => ({
  MorphCanvas: ({ algorithm }: { algorithm?: string }) => (
    <div>{`morph-${algorithm ?? "project"}`}</div>
  ),
}));

function image(id: string, source: ImageAsset["source"]): ImageAsset {
  return {
    id,
    name: id,
    width: 100,
    height: 100,
    source,
    placement: defaultPlacement(),
  };
}

beforeEach(() => {
  const source = image("source", {
    kind: "data-url",
    value: "data:image/png;base64,c291cmNl",
  });
  const target = image("target", {
    kind: "bundled",
    value: "/assets/target.webp",
  });
  useProjectStore.setState({ project: createProject(source, target) });
});

describe("MobileViewSwitcher", () => {
  it("switches the single live studio view without capturing its canvas", async () => {
    const user = userEvent.setup();
    render(<MobileViewSwitcher tab="studio" />);

    expect(screen.getByText("pane-source")).toBeInTheDocument();
    const sourceTab = screen.getByRole("tab", { name: "Source A" });
    const targetTab = screen.getByRole("tab", { name: "Target B" });
    expect(sourceTab.querySelector("img")).toHaveAttribute(
      "src",
      "data:image/png;base64,c291cmNl",
    );
    expect(targetTab.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/target.webp",
    );

    await user.click(targetTab);

    expect(screen.getByText("pane-target")).toBeInTheDocument();
    expect(screen.queryByText("pane-source")).not.toBeInTheDocument();
  });

  it("uses placeholders for generated compare views", () => {
    render(<MobileViewSwitcher tab="compare" />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.querySelector("img")).toBeNull();
    }
  });
});
