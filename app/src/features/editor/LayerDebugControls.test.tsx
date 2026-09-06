import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  createLayer,
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { LayerDebugControls } from "./LayerDebugControls";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function WithStudioShortcuts() {
  useKeyboardShortcuts();
  return <LayerDebugControls />;
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage("en"));
  useEditorStore.getState().resetEditor();
  const asset = (name: string): ImageAsset => ({
    id: name,
    name,
    width: 100,
    height: 100,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  });
  const project = createProject(asset("fox.png"), asset("bunny.png"));
  project.layers.push(createLayer("My custom layer"));
  useProjectStore.setState({ project });
});

afterEach(() => vi.unstubAllGlobals());

describe("compact preview controls", () => {
  it("dismisses the menu when resizing hides its trigger", async () => {
    const observers: {
      callback: ResizeObserverCallback;
      targets: Set<Element>;
      instance: ResizeObserver;
    }[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        targets = new Set<Element>();
        constructor(callback: ResizeObserverCallback) {
          observers.push({
            callback,
            targets: this.targets,
            instance: this as unknown as ResizeObserver,
          });
        }
        observe(target: Element) {
          this.targets.add(target);
        }
        unobserve(target: Element) {
          this.targets.delete(target);
        }
        disconnect = disconnect;
      },
    );
    const notifyResize = (width: number) => {
      const trigger = screen.getByRole("button", {
        name: i18n.t("layerDebug.controls"),
      });
      for (const { callback, targets, instance } of observers) {
        if (!targets.has(trigger)) continue;
        callback(
          [
            {
              target: trigger,
              contentRect: new DOMRect(0, 0, width, 28),
              contentBoxSize: [{ inlineSize: width, blockSize: 28 }],
              borderBoxSize: [{ inlineSize: width, blockSize: 28 }],
              devicePixelContentBoxSize: [{ inlineSize: width, blockSize: 28 }],
            },
          ],
          instance,
        );
      }
    };
    const user = userEvent.setup();
    render(<LayerDebugControls />);
    await user.click(
      screen.getByRole("button", { name: i18n.t("layerDebug.controls") }),
    );
    act(() => notifyResize(28));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => notifyResize(0));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });
  it("changes preview modes, overlays and selected layers without editing the project", async () => {
    const user = userEvent.setup();
    const originalProject = JSON.stringify(useProjectStore.getState().project);
    render(<WithStudioShortcuts />);
    await user.click(
      screen.getByRole("button", { name: i18n.t("layerDebug.controls") }),
    );
    const dialog = within(
      screen.getByRole("dialog", { name: i18n.t("layerDebug.controls") }),
    );
    await user.click(
      dialog.getByRole("button", { name: i18n.t("layerDebug.maskTitle") }),
    );
    expect(useEditorStore.getState().layerDebugMode).toBe("layer-mask");
    await user.click(
      dialog.getByRole("button", { name: i18n.t("layerDebug.allTitle") }),
    );
    expect(useEditorStore.getState().overlayLayerScope).toBe("all");
    const before = useEditorStore.getState().viewportOverlays.preview.features;
    await user.click(
      dialog.getByRole("button", {
        name: i18n.t("overlays.overlayAria", {
          label: i18n.t("overlays.features"),
        }),
      }),
    );
    expect(useEditorStore.getState().viewportOverlays.preview.features).toBe(
      !before,
    );
    await user.click(
      dialog.getByRole("button", {
        name: i18n.t("layerDebug.layerStack"),
      }),
    );
    await user.click(dialog.getByRole("button", { name: /My custom layer/ }));
    expect(useEditorStore.getState().activeLayerId).toBe(
      useProjectStore.getState().project?.layers[1].id,
    );
    await user.click(
      dialog.getByRole("button", { name: i18n.t("layerDebug.closeStack") }),
    );
    expect(useEditorStore.getState().showLayerStack).toBe(false);
    expect(JSON.stringify(useProjectStore.getState().project)).toBe(
      originalProject,
    );
  });

  it("blocks studio shortcuts and closes with Escape or the close button, restoring focus", async () => {
    const user = userEvent.setup();
    render(<WithStudioShortcuts />);
    const trigger = screen.getByRole("button", {
      name: i18n.t("layerDebug.controls"),
    });
    await user.click(trigger);
    await user.keyboard("pu{ArrowRight}");
    expect(useEditorStore.getState().activeTool).toBe("select");
    expect(useEditorStore.getState().overlayChromeHidden).toBe(false);
    expect(useEditorStore.getState().tauSec).toBe(0);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: i18n.t("mobile.close"),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
