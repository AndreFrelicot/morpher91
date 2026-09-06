import { createPolygonalTool } from "./polygonalTool";
import type { Tool } from "./tool";

/** Region-mask tool (PRD M11 lot 2): tap to add vertices or free-draw a closed
 *  outline; the contour is always closed and `smooth` strokes render curved. */
export function createRegionTool(): Tool {
  return createPolygonalTool({
    id: "region",
    minPoints: 3,
    allowResume: false,
  });
}
