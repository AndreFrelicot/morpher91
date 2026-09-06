import { useEffect } from "react";
import { hydrateProjectImages } from "@/lib/image/loadImage";
import { deserializeProject } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";

const DEV_FIXTURE_ROUTE = "/__bwmorpher__/fixtures/default-project.json";
const DEV_FIXTURE_PARAM = "bwmFixture";

let didAutoLoad = false;

async function loadDevFixture() {
  const response = await fetch(`${DEV_FIXTURE_ROUTE}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Could not load dev fixture (${response.status}): ${await response.text()}`,
    );
  }

  const loaded = await hydrateProjectImages(
    deserializeProject(await response.text()),
  );
  useProjectStore.getState().loadProject(loaded.project, {
    source: loaded.source,
    target: loaded.target,
  });
  useHistoryStore.setState({ past: [], future: [], pending: null });

  const editor = useEditorStore.getState();
  editor.clearSelection();
  editor.setTab("studio");
  editor.setStudioView("preview");
  editor.setLayerDebugMode("composite");
}

declare global {
  interface Window {
    __BWMORPHER_LOAD_DEV_FIXTURE__?: () => Promise<void>;
  }
}

export function DevFixtureLoader() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    window.__BWMORPHER_LOAD_DEV_FIXTURE__ = loadDevFixture;

    const params = new URLSearchParams(window.location.search);
    const fixture =
      params.get(DEV_FIXTURE_PARAM) ??
      params.get("devFixture") ??
      params.get("fixture");

    if (fixture !== "default" || didAutoLoad) return;

    didAutoLoad = true;
    void loadDevFixture().catch((err) => {
      console.error("[Morpher91] Could not load dev fixture.", err);
    });
  }, []);

  return null;
}
