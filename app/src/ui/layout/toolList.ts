import {
  Circle,
  Hand,
  Lasso,
  Minus,
  MousePointer2,
  Move,
  Paintbrush,
  Spline,
  type LucideIcon,
} from "lucide-react";
import type { EditorTool } from "@/store/editorStore";

/** Editor tools in display order, shared by the desktop rail and mobile bar. */
export const TOOLS: { id: EditorTool; Icon: LucideIcon }[] = [
  { id: "select", Icon: MousePointer2 },
  { id: "point", Icon: Circle },
  { id: "line", Icon: Minus },
  { id: "polyline", Icon: Spline },
  { id: "region", Icon: Lasso },
  { id: "brush", Icon: Paintbrush },
  { id: "push", Icon: Move },
  { id: "pan", Icon: Hand },
];
