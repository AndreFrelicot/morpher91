import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";

const loadComparePage = () =>
  import("@/features/compare/ComparePage").then((module) => ({
    default: module.ComparePage,
  }));

const loadExportDialog = () =>
  import("@/features/export/ExportDialog").then((module) => ({
    default: module.ExportDialog,
  }));

const loadDemoAssetsDialog = () =>
  import("@/features/demo/DemoAssetsDialog").then((module) => ({
    default: module.DemoAssetsDialog,
  }));

type SurfaceErrorBoundaryProps = {
  children: ReactNode;
  message: string;
  retryLabel: string;
  overlay?: boolean;
  onRetry: () => void;
};

type SurfaceErrorBoundaryState = { failed: boolean };

export class SurfaceErrorBoundary extends Component<
  SurfaceErrorBoundaryProps,
  SurfaceErrorBoundaryState
> {
  state: SurfaceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SurfaceErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    // Rendering the localized recovery UI is sufficient here.
  }

  private retry = () => {
    this.props.onRetry();
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className={
          this.props.overlay
            ? "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center text-sm text-foreground backdrop-blur-sm"
            : "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-foreground"
        }
      >
        <p>{this.props.message}</p>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={this.retry}
        >
          {this.props.retryLabel}
        </button>
      </div>
    );
  }
}

function LoadingFallback({ overlay = false }: { overlay?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        overlay
          ? "fixed inset-0 z-50 flex items-center justify-center bg-background/80 text-sm text-muted-foreground backdrop-blur-sm"
          : "flex h-full w-full items-center justify-center text-sm text-muted-foreground"
      }
    >
      {t("shell.loading")}
    </div>
  );
}

type RecoverableLazySurfaceProps = {
  load: () => Promise<{ default: ComponentType }>;
  message: string;
  retryLabel: string;
  overlay?: boolean;
};

type RecoverableLazySurfaceState = {
  Surface: LazyExoticComponent<ComponentType>;
  boundaryKey: number;
};

export class RecoverableLazySurface extends Component<
  RecoverableLazySurfaceProps,
  RecoverableLazySurfaceState
> {
  state: RecoverableLazySurfaceState = {
    Surface: lazy(this.props.load),
    boundaryKey: 0,
  };

  private retry = () => {
    this.setState((state) => ({
      Surface: lazy(this.props.load),
      boundaryKey: state.boundaryKey + 1,
    }));
  };

  render() {
    const { Surface } = this.state;
    const { message, overlay = false, retryLabel } = this.props;
    return (
      <SurfaceErrorBoundary
        key={this.state.boundaryKey}
        message={message}
        retryLabel={retryLabel}
        overlay={overlay}
        onRetry={this.retry}
      >
        <Suspense fallback={<LoadingFallback overlay={overlay} />}>
          <Surface />
        </Suspense>
      </SurfaceErrorBoundary>
    );
  }
}

function LocalizedRecoverableLazySurface({
  load,
  overlay = false,
}: Pick<RecoverableLazySurfaceProps, "load" | "overlay">) {
  const { t } = useTranslation();
  return (
    <RecoverableLazySurface
      load={load}
      message={t("shell.surfaceLoadError")}
      retryLabel={t("shell.retry")}
      overlay={overlay}
    />
  );
}

export function LazyComparePage() {
  return <LocalizedRecoverableLazySurface load={loadComparePage} />;
}

export function DeferredDemoAssetsDialog() {
  const open = useEditorStore((state) => state.demoDialogOpen);
  if (!open) return null;

  return (
    <LocalizedRecoverableLazySurface load={loadDemoAssetsDialog} overlay />
  );
}

export function DeferredExportDialog() {
  const open = useEditorStore((state) => state.exportDialogOpen);
  if (!open) return null;

  return <LocalizedRecoverableLazySurface load={loadExportDialog} overlay />;
}
