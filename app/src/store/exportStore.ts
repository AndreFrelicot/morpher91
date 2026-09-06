import { create } from "zustand";
import { defaultExportSettings, type ExportSettings } from "@/morph/model";

/** Final export settings (PRD §12.2), kept across tab switches. */
type ExportState = {
  settings: ExportSettings;
  setSettings: (patch: Partial<ExportSettings>) => void;
};

export const useExportStore = create<ExportState>((set) => ({
  settings: defaultExportSettings,
  setSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
