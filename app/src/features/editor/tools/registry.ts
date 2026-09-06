import { createBrushTool } from "./BrushTool";
import { createLineTool } from "./LineTool";
import { createPanTool } from "./PanTool";
import { createPointTool } from "./PointTool";
import { createPolylineTool } from "./PolylineTool";
import { createPushTool } from "./PushTool";
import { createRegionTool } from "./RegionTool";
import { createSelectTool } from "./SelectTool";
import type { Tool, ToolId } from "./tool";

/** Instantiates one stateful module per tool (PRD M11 lot 2). */
export function createToolRegistry(): Record<ToolId, Tool> {
  return {
    select: createSelectTool(),
    point: createPointTool(),
    line: createLineTool(),
    polyline: createPolylineTool(),
    region: createRegionTool(),
    brush: createBrushTool(),
    push: createPushTool(),
    pan: createPanTool(),
  };
}
