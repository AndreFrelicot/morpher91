import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { ExportError } from "@/morph/export/exportValidation";
import { useEditorStore } from "@/store/editorStore";
import { useExportStore } from "@/store/exportStore";
import { useProjectStore } from "@/store/projectStore";
import { ExportDialog } from "./ExportDialog";

const mocks = vi.hoisted(() => ({
  frames: vi.fn(),
  video: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/morph/export/exportMorph", () => ({
  exportMorphToFrameZip: mocks.frames,
  exportMorphToVideo: mocks.video,
}));

vi.mock("./download", () => ({
  startBlobDownload: mocks.download,
}));

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {},
  });
  mocks.frames.mockReset();
  mocks.video.mockReset();
  mocks.download.mockReset();
  const project = createProject(image("a"), image("b"));
  useProjectStore.setState({
    source: {
      asset: project.images.source,
      bitmap: { width: 640, height: 480 } as ImageBitmap,
    },
    target: {
      asset: project.images.target,
      bitmap: { width: 640, height: 480 } as ImageBitmap,
    },
    sourceVideo: null,
    targetVideo: null,
    project,
  });
  useExportStore.setState((state) => ({
    settings: { ...state.settings, outputKind: "frames" },
  }));
  useEditorStore.setState({ exportDialogOpen: true });
});

describe("ExportDialog", () => {
  it("cancels without downloading and returns to an exportable state", async () => {
    mocks.frames.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new ExportError("cancelled")),
            { once: true },
          );
        }),
    );
    const user = userEvent.setup();
    render(<ExportDialog />);

    await user.click(screen.getByRole("button", { name: "Export ZIP" }));
    const cancel = await screen.findByRole("button", {
      name: "Cancel export",
    });

    // Dismissing the dialog would abort the export: Escape and the close
    // button are inert while it runs.
    await user.keyboard("{Escape}");
    expect(useEditorStore.getState().exportDialogOpen).toBe(true);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    await user.click(cancel);

    expect(await screen.findByText("Export cancelled.")).toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export ZIP" })).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(useEditorStore.getState().exportDialogOpen).toBe(false);
  });

  it("blocks export and explains when WebGPU is unavailable", () => {
    Reflect.deleteProperty(navigator, "gpu");

    render(<ExportDialog />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "WebGPU is required to export this project.",
    );
    expect(screen.getByRole("button", { name: "Export ZIP" })).toBeDisabled();
  });
});
