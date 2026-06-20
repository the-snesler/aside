import { useEffect, useState } from "react";

/**
 * True on coarse-pointer devices (phones/tablets) where there's no hover and no
 * physical Shift key. Drives mobile-only behaviour: Enter inserts a newline
 * instead of sending, and a long-press opens the action sheet. Reacts to the
 * media query changing (e.g. plugging in a mouse) so the UI stays correct.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() =>
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia("(pointer: coarse)").matches
      : false,
  );

  useEffect(() => {
    if (!("matchMedia" in window)) return;
    const query = window.matchMedia("(pointer: coarse)");
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
