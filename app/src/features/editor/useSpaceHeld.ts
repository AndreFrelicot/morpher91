import { useEffect, useState } from "react";
import { isTextTarget } from "./useKeyboardShortcuts";

/** Tracks whether the spacebar is held, for space+drag panning (PRD §14.3). */
export function useSpaceHeld(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.code === "Space" && !isTextTarget(e.target)) {
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return held;
}
