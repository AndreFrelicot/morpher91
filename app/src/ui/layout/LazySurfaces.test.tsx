import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import {
  DeferredDemoAssetsDialog,
  DeferredExportDialog,
  LazyComparePage,
  RecoverableLazySurface,
} from "./LazySurfaces";

const loaded = vi.hoisted(() => ({
  compare: vi.fn(),
  export: vi.fn(),
  demo: vi.fn(),
}));

vi.mock("@/features/compare/ComparePage", () => {
  loaded.compare();
  return { ComparePage: () => <div>compare surface</div> };
});

vi.mock("@/features/export/ExportDialog", () => {
  loaded.export();
  return {
    ExportDialog: () => <div role="dialog">export surface</div>,
  };
});

vi.mock("@/features/demo/DemoAssetsDialog", () => {
  loaded.demo();
  return {
    DemoAssetsDialog: () => <div role="dialog">demo surface</div>,
  };
});

beforeEach(() => {
  useEditorStore.getState().resetEditor();
});

describe("lazy application surfaces", () => {
  it("keeps the app alive and retries a failed lazy import", async () => {
    const load = vi
      .fn<() => Promise<{ default: () => React.JSX.Element }>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValue({ default: () => <div>recovered surface</div> });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <RecoverableLazySurface
        load={load}
        message="surface failed"
        retryLabel="retry"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "surface failed",
    );

    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(await screen.findByText("recovered surface")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("loads compare only when its wrapper mounts", async () => {
    expect(loaded.compare).not.toHaveBeenCalled();

    render(<LazyComparePage />);
    expect(await screen.findByText("compare surface")).toBeInTheDocument();
    expect(loaded.compare).toHaveBeenCalledOnce();
  });

  it("does not load the export dialog before it is opened", async () => {
    render(<DeferredExportDialog />);
    expect(loaded.export).not.toHaveBeenCalled();

    act(() => useEditorStore.getState().setExportDialogOpen(true));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "export surface",
    );
    expect(loaded.export).toHaveBeenCalledOnce();
  });

  it("does not load the demo dialog before it is opened", async () => {
    render(<DeferredDemoAssetsDialog />);
    expect(loaded.demo).not.toHaveBeenCalled();

    act(() => useEditorStore.getState().setDemoDialogOpen(true));

    expect(await screen.findByRole("dialog")).toHaveTextContent("demo surface");
    expect(loaded.demo).toHaveBeenCalledOnce();
  });
});
