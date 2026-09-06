import i18next from "i18next";
import {
  appendPolylineVertex,
  appendRegionVertex,
  createPolylineFeature,
  createRegionFeature,
  type FeaturePair,
  type NormalizedVec2,
  type Vec2,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { isClosedStroke, simplifyRdp } from "@/lib/geometry/simplify";
import type { Rgba } from "@/morph/overlay/scene";
import { HandleDrag } from "./handleDrag";
import { draftClickAction, findResumablePolyline } from "./polylineDraft";
import {
  applyActiveLayer,
  clampNorm,
  dist,
  emptyScene,
  HANDLE_HIT_RADIUS,
  hitTestHandle,
} from "./toolHelpers";
import type { ToolHud } from "./hud";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

/** Drag past this (screen px) from the press point turns a tap into a free-draw. */
const FREEHAND_THRESHOLD_PX = 6;
/** RDP tolerance (screen px) used to extract control points from a freehand stroke. */
const SIMPLIFY_PX = 2.5;
/** Ends-meet distance (screen px) that marks a freehand stroke as a closed loop. */
const CLOSE_PX = 12;

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

type Kind = "polyline" | "region";

type Draft = {
  id: string;
  /** Freshly created here (vs. resuming an existing open polyline). */
  isNew: boolean;
  /** Original geometry to restore if a resume is cancelled. */
  snapshot?: { a: NormalizedVec2[]; b: NormalizedVec2[]; closed?: boolean };
};

type Stroke = {
  startScreen: Vec2;
  samples: { screen: Vec2; norm: NormalizedVec2 }[];
  /** Crossed the threshold ⇒ this gesture is a free-draw, not a tap. */
  active: boolean;
};

type Options = {
  id: Kind;
  /** Polyline = 2, region = 3. */
  minPoints: number;
  /** Polyline endpoints can be resumed; regions cannot. */
  allowResume: boolean;
};

/**
 * Shared polyline/region authoring tool (PRD M11 lot 2). Two creation modes that
 * never entangle: **tap** to place vertices (click the first vertex or press
 * Enter to finish, Escape to cancel) and **press-drag** to free-draw a whole
 * contour in one stroke — which is RDP-simplified to editable control points and
 * flagged `smooth` (Catmull-Rom on display). Open polylines can be resumed by
 * clicking an endpoint; mid-vertices and other features still drag via the shared
 * {@link HandleDrag}, so all the old editing keeps working.
 */
export function createPolygonalTool(opts: Options): Tool {
  const { id, minPoints, allowResume } = opts;
  const drag = new HandleDrag();
  let draft: Draft | null = null;
  let stroke: Stroke | null = null;

  const store = () => useProjectStore.getState();
  const rawFeature = (fid: string): FeaturePair | undefined =>
    store().project?.features.find((f) => f.id === fid);
  const createFeature = (n: NormalizedVec2): FeaturePair =>
    id === "polyline" ? createPolylineFeature([n]) : createRegionFeature([n]);
  const appendVertex = (f: FeaturePair, n: NormalizedVec2) =>
    f.kind === "region"
      ? appendRegionVertex(f, n)
      : appendPolylineVertex(
          f as Extract<FeaturePair, { kind: "polyline" }>,
          n,
        );

  const sidePoints = (f: FeaturePair, ctx: ToolContext): NormalizedVec2[] =>
    f.kind === "polyline" || f.kind === "region"
      ? ctx.side === "a"
        ? f.a
        : f.b
      : [];

  /** Finishes a tap-built draft: commit if it has enough points, else discard. */
  const finalizeDraft = (): void => {
    if (!draft) return;
    const d = draft;
    draft = null;
    const f = rawFeature(d.id);
    const len = f
      ? f.kind === "polyline" || f.kind === "region"
        ? f.a.length
        : 0
      : 0;
    const history = useHistoryStore.getState();
    if (f && len >= minPoints) {
      history.commit();
    } else {
      if (f && d.isNew) store().removeFeature(d.id);
      else if (f && d.snapshot) store().updateFeature(d.id, d.snapshot);
      history.cancel();
    }
  };

  const dropDraft = (): void => {
    if (!draft) return;
    const d = draft;
    draft = null;
    const f = rawFeature(d.id);
    if (f && d.isNew) store().removeFeature(d.id);
    else if (f && d.snapshot) store().updateFeature(d.id, d.snapshot);
    useHistoryStore.getState().cancel();
  };

  const finalizeFreehand = (ctx: ToolContext): void => {
    if (!draft || !stroke) return;
    const d = draft;
    draft = null;
    const f = rawFeature(d.id);
    const history = useHistoryStore.getState();
    if (!f || (f.kind !== "polyline" && f.kind !== "region")) {
      history.cancel();
      stroke = null;
      return;
    }
    const scale =
      Math.min(ctx.transform.content.width, ctx.transform.content.height) || 1;
    const dense = stroke.samples.map((s) => s.norm);
    const simplified = simplifyRdp(dense, SIMPLIFY_PX / scale);
    const closedLoop =
      id === "polyline" ? isClosedStroke(dense, CLOSE_PX / scale) : true;
    if (simplified.length < minPoints) {
      store().removeFeature(d.id);
      history.cancel();
      stroke = null;
      return;
    }
    const points = simplified.map((p) => ({ ...p }));
    store().updateFeature(d.id, {
      a: points.map((p) => ({ ...p })),
      b: points.map((p) => ({ ...p })),
      smooth: true,
      ...(id === "polyline" ? { closed: closedLoop } : {}),
    });
    history.commit();
    stroke = null;
  };

  return {
    ...toolDefaults,
    id,

    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      // 1. Tap on an in-progress draft: close or append a vertex.
      if (draft) {
        const f = rawFeature(draft.id);
        if (f && (f.kind === "polyline" || f.kind === "region")) {
          const screenPts = sidePoints(f, ctx).map((q) =>
            ctx.transform.toScreen(q),
          );
          const action = draftClickAction(
            screenPts,
            p.screen,
            minPoints,
            HANDLE_HIT_RADIUS,
          );
          if (action === "append") {
            store().updateFeature(f.id, appendVertex(f, clampNorm(p.norm)));
          } else {
            if (action === "close-first" && id === "polyline") {
              store().updateFeature(f.id, { closed: true });
            }
            finalizeDraft();
          }
          return;
        }
        draft = null;
      }

      // 2. Resume an open polyline by clicking its endpoint.
      if (allowResume) {
        const r = findResumablePolyline(
          ctx.features,
          ctx.side,
          ctx.transform,
          p.screen,
          HANDLE_HIT_RADIUS,
        );
        const f = r ? rawFeature(r.id) : undefined;
        if (r && f && f.kind === "polyline") {
          useHistoryStore.getState().begin();
          draft = {
            id: f.id,
            isNew: false,
            snapshot: {
              a: f.a.map((q) => ({ ...q })),
              b: f.b.map((q) => ({ ...q })),
              closed: f.closed,
            },
          };
          if (r.end === "first") {
            store().updateFeature(f.id, {
              a: [...f.a].reverse(),
              b: [...f.b].reverse(),
            });
          }
          useEditorStore.getState().selectFeature(f.id, "replace");
          return;
        }
      }

      // 3. Drag an existing handle (mid-vertex / other feature).
      if (drag.startFromHit(p, ctx)) return;

      // 4. Start a new draft, and watch for a free-draw.
      if (!ctx.activeLayerEditable) return;
      const n = clampNorm(p.norm);
      const f = applyActiveLayer(createFeature(n), ctx.activeLayerId);
      useHistoryStore.getState().begin();
      store().addFeature(f);
      useEditorStore.getState().selectFeature(f.id, "replace");
      draft = { id: f.id, isNew: true };
      stroke = {
        startScreen: p.screen,
        samples: [{ screen: p.screen, norm: n }],
        active: false,
      };
    },

    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      if (drag.isActive()) {
        drag.move(p, ctx);
        return;
      }
      if (!draft || !stroke) return;
      if (
        !stroke.active &&
        dist(p.screen, stroke.startScreen) > FREEHAND_THRESHOLD_PX
      ) {
        stroke.active = true;
      }
      if (stroke.active) {
        for (const s of p.coalesced) {
          stroke.samples.push({ screen: s.screen, norm: clampNorm(s.norm) });
        }
      }
    },

    onPointerUp(_p: ToolPointer, ctx: ToolContext) {
      if (drag.isActive()) {
        drag.end();
        useHistoryStore.getState().commit();
        return;
      }
      if (stroke?.active) finalizeFreehand(ctx);
      // A tap that started/extended the draft keeps the draft alive for more taps.
      stroke = null;
    },

    onPointerHover(p: ToolPointer, ctx: ToolContext) {
      if (draft) return; // mid-draft: keep the close target, don't flicker hover
      const hit = hitTestHandle(ctx, p.screen);
      ctx.setHovered(hit?.id ?? null, hit?.key ?? null);
    },

    commit() {
      finalizeDraft();
    },

    cancel() {
      dropDraft();
      stroke = null;
      drag.reset();
    },

    scene(p, ctx, palette): ReturnType<Tool["scene"]> {
      const accent = ctx.side === "a" ? palette.accentA : palette.accentB;
      const out = emptyScene();
      if (stroke?.active && stroke.samples.length >= 2) {
        for (let i = 0; i + 1 < stroke.samples.length; i++) {
          out.lines.push({
            a: stroke.samples[i].norm,
            b: stroke.samples[i + 1].norm,
            color: accent,
            widthPx: 1.5,
          });
        }
        return out;
      }
      if (draft && p) {
        const f = rawFeature(draft.id);
        const pts = f ? sidePoints(f, ctx) : [];
        if (pts.length > 0) {
          out.lines.push({
            a: pts[pts.length - 1],
            b: clampNorm(p.norm),
            color: withAlpha(accent, 0.6),
            widthPx: 1,
          });
          const firstScreen = ctx.transform.toScreen(pts[0]);
          if (
            pts.length >= minPoints &&
            dist(firstScreen, p.screen) <= HANDLE_HIT_RADIUS
          ) {
            out.dots.push({
              pos: pts[0],
              radiusPx: 8,
              fill: withAlpha(accent, 0),
              stroke: accent,
              strokeWidthPx: 1.5,
            });
          }
        }
        return out;
      }
      return null;
    },

    hud(_p, ctx): ToolHud[] {
      if (!draft) return [];
      const f = rawFeature(draft.id);
      if (!f || (f.kind !== "polyline" && f.kind !== "region")) return [];
      const pts = sidePoints(f, ctx);
      if (pts.length === 0) return [];
      const canClose = pts.length >= minPoints;
      const count = i18next.t("hud.points", { count: pts.length });
      return [
        {
          at: pts[pts.length - 1],
          text: canClose
            ? `${count} · ${i18next.t("hud.finishHint")}`
            : `${count} · ${i18next.t("hud.cancelHint")}`,
          dx: 10,
          dy: -18,
          tone: "muted",
        },
      ];
    },

    cursor(ctx: ToolContext) {
      return ctx.hoveredId ? "cursor-pointer" : "cursor-crosshair";
    },

    wantsCursor() {
      return Boolean(draft) || Boolean(stroke?.active);
    },

    hasDraft() {
      return Boolean(draft);
    },
  };
}
