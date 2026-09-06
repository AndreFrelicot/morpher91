/**
 * Registry of `data-assist` anchors (M16). Every id here MUST be placed on
 * exactly the UI element it names, and every anchor referenced by a guide MUST
 * exist here — a static sync test enforces both directions.
 */
export const ANCHORS = {
  "topbar.new": "topbar.new",
  "topbar.demo": "topbar.demo",
  "topbar.load": "topbar.load",
  "topbar.save": "topbar.save",
  "topbar.export": "topbar.export",
  "topbar.help": "topbar.help",
  "topbar.about": "topbar.about",
  "topbar.language": "topbar.language",
  "topbar.tab.studio": "topbar.tab.studio",
  "topbar.tab.compare": "topbar.tab.compare",
  "tools.select": "tools.select",
  "tools.point": "tools.point",
  "tools.line": "tools.line",
  "tools.polyline": "tools.polyline",
  "tools.region": "tools.region",
  "tools.brush": "tools.brush",
  "tools.push": "tools.push",
  "tools.pan": "tools.pan",
  "assets.source": "assets.source",
  "assets.target": "assets.target",
  "features.list": "features.list",
  "algorithm.list": "algorithm.list",
  "algorithm.settings": "algorithm.settings",
  "layers.add": "layers.add",
  "layers.list": "layers.list",
  "layers.inspector": "layers.inspector",
  "layer.algorithmOverride": "layer.algorithmOverride",
  "layer.maskSelect": "layer.maskSelect",
  "layer.opacity": "layer.opacity",
  "layer.transition": "layer.transition",
  "selection.inspector": "selection.inspector",
  "brush.controls": "brush.controls",
  "view.toggle": "view.toggle",
  "pane.source": "pane.source",
  "pane.target": "pane.target",
  "timeline.play": "timeline.play",
  "timeline.ruler": "timeline.ruler",
  "timeline.tracks": "timeline.tracks",
  "export.panel": "export.panel",
  "export.button": "export.button",
} as const;

export type AnchorId = keyof typeof ANCHORS;

/** Spread onto a JSX element to anchor it: `<button {...assist("topbar.demo")}>`. */
export function assist(id: AnchorId): { "data-assist": AnchorId } {
  return { "data-assist": id };
}
