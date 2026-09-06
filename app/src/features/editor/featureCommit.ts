import type { FeatureId, FeaturePatch } from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { useHistoryStore } from "@/store/historyStore";

/** Applies a feature patch as a single, atomic history step. */
export function commitFeatureChange(id: FeatureId, patch: FeaturePatch) {
  const history = useHistoryStore.getState();
  history.begin();
  useProjectStore.getState().updateFeature(id, patch);
  history.commit();
}

/** Begin a live edit session (e.g. text input focus); pair with commitEdit. */
export function beginEdit() {
  useHistoryStore.getState().begin();
}

/** Commit a live edit session opened with beginEdit (records one step). */
export function commitEdit() {
  useHistoryStore.getState().commit();
}

/** Drop a live edit session opened with beginEdit without recording a step. */
export function cancelEdit() {
  useHistoryStore.getState().cancel();
}

/** Removes several features in one history step and returns nothing. */
export function deleteFeatures(ids: FeatureId[]) {
  if (ids.length === 0) return;
  const history = useHistoryStore.getState();
  const store = useProjectStore.getState();
  history.begin();
  ids.forEach((id) => store.removeFeature(id));
  history.commit();
}
