import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import italian from "@/i18n/locales/it.json";
import {
  createProject,
  defaultPlacement,
  GLOBAL_LAYER_ID,
  type ImageAsset,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { TimelineDock } from "./TimelineDock";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 100,
  height: 100,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  useProjectStore.setState({
    project: createProject(image("fox.png"), image("bunny.png")),
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
  });
  useEditorStore.setState({
    tauSec: 0,
    playing: false,
    activeLayerId: GLOBAL_LAYER_ID,
    selection: [],
    panelsOpen: { left: true, right: true, timeline: true },
  });
});

describe("TimelineDock image clips", () => {
  it("selects a still clip and commits a duration beyond the old montage", () => {
    render(<TimelineDock />);
    const clip = screen.getByRole("button", {
      name: i18n.t("timeline.mediaClip", { slot: "A", name: "fox.png" }),
    });
    fireEvent.keyDown(clip, { key: "Enter" });
    const field = screen.getByRole("textbox", {
      name: i18n.t("timeline.timecodeAria", { label: i18n.t("timeline.dur") }),
    });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "12.5" } });
    fireEvent.blur(field);
    expect(useProjectStore.getState().project?.images.source.timeline).toEqual({
      startSec: 0,
      durationSec: 12.5,
    });
    expect(useProjectStore.getState().project?.images.target.timeline).toEqual({
      startSec: 0,
      durationSec: 4,
    });
    expect(useProjectStore.getState().project?.timeline.durationSec).toBe(12.5);
    expect(
      screen.queryByRole("textbox", {
        name: i18n.t("timeline.timecodeAria", { label: i18n.t("timeline.in") }),
      }),
    ).not.toBeInTheDocument();
  });
});

afterEach(async () => {
  await act(() => i18n.changeLanguage("en"));
});

describe("TimelineDock localized layer names", () => {
  beforeEach(() => {
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: {
        ...project,
        layers: project.layers.map((layer) => ({
          ...layer,
          timing: {
            ...layer.timing,
            dissolveStart: 0.3,
            dissolveEnd: 0.7,
          },
        })),
      },
    });
  });
  it("translates the base labels and transition tooltip without renaming project data", async () => {
    i18n.addResourceBundle("it", "translation", italian, true, true);
    await act(() => i18n.changeLanguage("it"));
    const before = JSON.stringify(useProjectStore.getState().project);
    render(<TimelineDock />);
    const base = screen.getByRole("button", { name: "Globale" });
    fireEvent.click(base);
    expect(screen.getAllByText("Globale").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTitle(/Globale — dissolvenza/)).toBeInTheDocument();
    expect(screen.queryByText("Global")).not.toBeInTheDocument();
    expect(JSON.stringify(useProjectStore.getState().project)).toBe(before);
  });

  it("keeps a customized base name", async () => {
    i18n.addResourceBundle("it", "translation", italian, true, true);
    await act(() => i18n.changeLanguage("it"));
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: {
        ...project,
        layers: project.layers.map((layer) => ({ ...layer, name: "My base" })),
      },
    });
    render(<TimelineDock />);
    expect(screen.getByRole("button", { name: "My base" })).toBeInTheDocument();
    expect(screen.getByTitle(/My base — dissolvenza/)).toBeInTheDocument();
    expect(screen.queryByText("Globale")).not.toBeInTheDocument();
  });
});
