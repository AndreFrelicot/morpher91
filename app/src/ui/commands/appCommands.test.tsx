import { createRef } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { useAssistStore } from "@/assist/assistStore";
import { useDialogStore } from "@/store/dialogStore";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { APP_TABS, useAppCommands } from "./appCommands";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/features/editor/projectFile", () => ({
  loadProjectFile: mocks.load,
  projectFileErrorKey: () => "topbar.loadError",
  saveProjectFile: mocks.save,
}));

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 100,
  height: 100,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  mocks.load.mockReset();
  mocks.save.mockReset();
  useProjectStore.setState({
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
    project: null,
    activeAlgorithm: "crossfade",
  });
  useEditorStore.getState().resetEditor();
  useHistoryStore.getState().resetHistory();
  useAssistStore.setState({ launcherOpen: false });
  useDialogStore.getState().settle(false);
  vi.restoreAllMocks();
});

describe("shared app commands", () => {
  const renderCommands = (handled?: () => void) =>
    renderHook(() => useAppCommands(createRef<HTMLInputElement>(), handled));

  it("uses one ordered tab definition for both shells", () => {
    expect(APP_TABS.map((tab) => tab.id)).toEqual(["studio", "compare"]);
  });

  it("starts New immediately when the store is empty", async () => {
    useEditorStore.setState({ activeTool: "brush", tauSec: 2 });
    const { result } = renderCommands();

    await act(async () => expect(await result.current.newProject()).toBe(true));

    expect(useDialogStore.getState().pending).toBeNull();
    expect(useEditorStore.getState()).toMatchObject({
      activeTool: "select",
      tauSec: 0,
    });
  });

  it("does not mutate a loaded project when New is cancelled in-app", async () => {
    const project = createProject(image("source"), image("target"));
    useProjectStore.setState({ project });
    useEditorStore.setState({ selection: ["keep"] });
    const handled = vi.fn();
    const { result } = renderCommands(handled);
    let outcome!: Promise<boolean>;

    act(() => {
      outcome = result.current.newProject();
    });
    expect(useDialogStore.getState().pending?.request).toMatchObject({
      kind: "confirm",
      title: "New project",
      destructive: true,
    });
    act(() => useDialogStore.getState().settle(false));

    expect(await outcome).toBe(false);

    expect(useProjectStore.getState().project).toBe(project);
    expect(useEditorStore.getState().selection).toEqual(["keep"]);
    expect(handled).not.toHaveBeenCalled();
  });

  it("opens Demo, Export and Help through their real stores", () => {
    const { result } = renderCommands();

    act(() => result.current.openDemo());
    expect(useEditorStore.getState().demoDialogOpen).toBe(true);

    act(() => result.current.openExport());
    expect(useEditorStore.getState().exportDialogOpen).toBe(true);

    act(() => result.current.openHelp());
    expect(useAssistStore.getState().launcherOpen).toBe(true);
  });

  it("delegates Load and Save to the shared project file functions", async () => {
    const project = createProject(image("source"), image("target"));
    useProjectStore.setState({ project });
    const file = new File(["{}"], "project.morph.json", {
      type: "application/json",
    });
    mocks.load.mockResolvedValue(undefined);
    const { result } = renderCommands();

    await act(() => result.current.loadFile(file));
    await act(async () =>
      expect(await result.current.saveProject()).toBe(true),
    );

    expect(mocks.load).toHaveBeenCalledWith(file);
    expect(mocks.save).toHaveBeenCalledWith(project);
  });

  it("reports a failed Load through the in-app alert", async () => {
    const file = new File(["nope"], "broken.json", {
      type: "application/json",
    });
    mocks.load.mockRejectedValue(new Error("invalid"));
    const { result } = renderCommands();
    let outcome!: Promise<boolean>;

    act(() => {
      outcome = result.current.loadFile(file);
    });
    await vi.waitFor(() =>
      expect(useDialogStore.getState().pending?.request).toMatchObject({
        kind: "alert",
        message: "Could not load project.",
      }),
    );
    act(() => useDialogStore.getState().settle(true));

    expect(await outcome).toBe(false);
  });
});
