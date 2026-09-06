import { create } from "zustand";
import type { FeaturePair } from "@/morph/model";
import { useProjectStore } from "./projectStore";

/** Max retained undo steps. PRD §13.2 */
const LIMIT = 100;

const clone = (features: FeaturePair[]): FeaturePair[] =>
  structuredClone(features);

/** Structural equality ignoring timestamps, to skip no-op transactions. */
const sameFeatures = (a: FeaturePair[], b: FeaturePair[]): boolean => {
  const strip = (fs: FeaturePair[]) =>
    JSON.stringify(
      fs.map((f) => ({ ...f, createdAt: undefined, updatedAt: undefined })),
    );
  return strip(a) === strip(b);
};

const features = () => useProjectStore.getState().project?.features ?? null;

/**
 * Undo/redo over the project's feature list (PRD §13.2). A drag is wrapped in
 * begin()/commit(): the live mutations happen via projectStore, and commit
 * records a single step only if something actually changed.
 */
type HistoryState = {
  past: FeaturePair[][];
  future: FeaturePair[][];
  /** Snapshot captured at transaction start, pending commit. */
  pending: FeaturePair[] | null;
  begin: () => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  pending: null,

  begin: () => {
    const current = features();
    set({ pending: current ? clone(current) : null });
  },

  commit: () => {
    const { pending, past } = get();
    if (!pending) return;
    const current = features();
    if (!current || sameFeatures(pending, current)) {
      set({ pending: null });
      return;
    }
    set({ past: [...past, pending].slice(-LIMIT), future: [], pending: null });
  },

  cancel: () => set({ pending: null }),
  resetHistory: () => set({ past: [], future: [], pending: null }),

  undo: () => {
    const { past } = get();
    const current = features();
    if (past.length === 0 || !current) return;
    const previous = past[past.length - 1];
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [...s.future, clone(current)],
    }));
    useProjectStore.getState().setFeatures(clone(previous));
  },

  redo: () => {
    const { future } = get();
    const current = features();
    if (future.length === 0 || !current) return;
    const next = future[future.length - 1];
    set((s) => ({
      future: s.future.slice(0, -1),
      past: [...s.past, clone(current)].slice(-LIMIT),
    }));
    useProjectStore.getState().setFeatures(clone(next));
  },
}));
