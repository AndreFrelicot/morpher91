import { createPolygonalTool } from "./polygonalTool";
import type { Tool } from "./tool";

/** Polyline tool (PRD M11 lot 2): tap to add vertices, free-draw to trace, click
 *  the first vertex to close, and resume an open polyline by its endpoint. */
export function createPolylineTool(): Tool {
  return createPolygonalTool({
    id: "polyline",
    minPoints: 2,
    allowResume: true,
  });
}
