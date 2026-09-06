import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { matchesSearch } from "@/i18n/search";
import { cn } from "@/lib/utils";
import { GLOBAL_LAYER_ID } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { GUIDES, getGuide } from "./guides";
import type { Guide, GuideCategory, L } from "./guides";
import type { AssistSnapshot } from "./guides/types";
import { useAssistStore } from "./assistStore";

const CATEGORY_ORDER: GuideCategory[] = [
  "start",
  "features",
  "layers-masks",
  "timeline-video",
  "output",
];

function pick(l: L, lang: string): string {
  return i18n.getFixedT(lang)(l);
}

/**
 * Contextual suggestion rules (M16 lot 5): simple predicates on the current
 * state, evaluated in order; the first three actionable matches are shown.
 */
const SUGGESTION_RULES: {
  id: string;
  when: (s: AssistSnapshot) => boolean;
}[] = [
  { id: "load-images", when: ({ project }) => project.project === null },
  {
    id: "place-points",
    when: ({ project }) =>
      project.project !== null && project.project.features.length === 0,
  },
  {
    id: "draw-lines",
    when: ({ project }) =>
      project.activeAlgorithm !== "beier-neely" &&
      (project.project?.features ?? []).some((f) => f.kind === "segment"),
  },
  {
    id: "mask-region",
    when: ({ editor, project }) => {
      const layer = project.project?.layers.find(
        (l) => l.id === editor.activeLayerId,
      );
      return (
        !!layer &&
        layer.id !== GLOBAL_LAYER_ID &&
        !layer.mask &&
        !layer.paintedMask
      );
    },
  },
  {
    id: "paint-mask",
    when: ({ editor, project }) => {
      const layer = project.project?.layers.find(
        (l) => l.id === editor.activeLayerId,
      );
      return (
        !!layer &&
        layer.id !== GLOBAL_LAYER_ID &&
        !layer.mask &&
        !layer.paintedMask
      );
    },
  },
  {
    id: "create-layer",
    when: ({ project }) =>
      (project.project?.layers.length ?? 0) <= 1 &&
      (project.project?.features.length ?? 0) > 0,
  },
  {
    id: "videos",
    when: ({ project }) =>
      project.project !== null &&
      !project.project.videos?.source &&
      !project.project.videos?.target,
  },
];

function suggestions(snapshot: AssistSnapshot): Guide[] {
  const out: Guide[] = [];
  for (const rule of SUGGESTION_RULES) {
    if (out.length >= 3) break;
    if (!rule.when(snapshot)) continue;
    const guide = getGuide(rule.id);
    if (!guide) continue;
    if (guide.precondition && !guide.precondition(snapshot)) continue;
    out.push(guide);
  }
  return out;
}

function matches(guide: Guide, lang: string, query: string): boolean {
  return matchesSearch(
    `${pick(guide.title, lang)} ${pick(guide.description, lang)} ${pick(guide.keywords, lang)}`,
    query,
    lang,
  );
}

export function AssistLauncher() {
  const open = useAssistStore((s) => s.launcherOpen);
  const setOpen = useAssistStore((s) => s.setLauncherOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* Content only mounts while open: it subscribes to the full editor and
          project stores (precondition reactivity), which would otherwise
          re-render on every playback tick. */}
      {open && <LauncherContent />}
    </Dialog.Root>
  );
}

function LauncherContent() {
  const { t, i18n } = useTranslation();
  const startGuide = useAssistStore((s) => s.startGuide);
  const editor = useEditorStore();
  const project = useProjectStore();
  const [query, setQuery] = useState("");

  const lang = i18n.language;
  const visible = GUIDES.filter((g) => matches(g, lang, query));
  const suggested = query.trim() === "" ? suggestions({ editor, project }) : [];

  return (
    <Dialog.Portal>
      <ModalBackdrop className="z-[80]" />
      <Dialog.Content
        className={cn(
          dialogStyles.position,
          dialogStyles.surface,
          "z-[81] flex max-h-[80dvh] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-hidden",
        )}
      >
        <div className={dialogStyles.header}>
          <div>
            <Dialog.Title className={dialogStyles.title}>
              {t("assist.launcherTitle")}
            </Dialog.Title>
            <Dialog.Description className={dialogStyles.description}>
              {t("assist.launcherDescription")}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t("mobile.close")}
              className={dialogStyles.close}
            >
              <X className="size-5" aria-hidden />
            </button>
          </Dialog.Close>
        </div>

        <div className="border-b border-border px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-2 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("assist.searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {suggested.length > 0 && (
            <div className="mb-2 rounded-md border border-selection/25 bg-selection/5 p-1">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("assist.suggestions")}
              </p>
              <ul>
                {suggested.map((guide) => (
                  <li key={guide.id}>
                    <button
                      type="button"
                      onClick={() => startGuide(guide.id)}
                      className="w-full rounded-md px-2 py-1.5 text-start outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block text-sm font-medium">
                        {pick(guide.title, lang)}
                      </span>
                      <span className="block text-sm leading-relaxed text-muted-foreground">
                        {pick(guide.description, lang)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visible.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t("assist.noResults")}
            </p>
          )}
          {CATEGORY_ORDER.map((category) => {
            const guides = visible.filter((g) => g.category === category);
            if (guides.length === 0) return null;
            return (
              <div key={category} className="mb-2">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`assist.categories.${category}`)}
                </p>
                <ul>
                  {guides.map((guide) => {
                    const blocked =
                      guide.precondition &&
                      !guide.precondition({ editor, project });
                    return (
                      <li key={guide.id}>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => startGuide(guide.id)}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                            blocked
                              ? "cursor-not-allowed opacity-60"
                              : "hover:bg-accent/50",
                          )}
                        >
                          <span className="block text-sm font-medium">
                            {pick(guide.title, lang)}
                          </span>
                          <span className="block text-sm leading-relaxed text-muted-foreground">
                            {blocked && guide.preconditionHint
                              ? pick(guide.preconditionHint, lang)
                              : pick(guide.description, lang)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
