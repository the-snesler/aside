import { useCallback, useEffect, useState } from "react";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  REMINDERS_ID,
  SETTINGS_ID,
  TASKS_ID,
  TODAY_ID,
} from "./views";

/**
 * The app's single `view: string` (a smart-filter sentinel or a channel id) maps
 * 1:1 to a URL path so reloads, back/forward, and deep links all work. The smart
 * sentinels are internal strings (`__home__`, `__today__`, …); we surface them as
 * clean reserved paths. Anything else is a channel id — channel ids are uuids
 * (the lone exception is the default channel id "general"), so they never collide
 * with the reserved words below.
 */
const RESERVED: ReadonlyArray<readonly [string, string]> = [
  [TODAY_ID, "today"],
  [TASKS_ID, "tasks"],
  [REMINDERS_ID, "reminders"],
  [LINKS_ID, "links"],
  [PHOTOS_ID, "photos"],
  [SETTINGS_ID, "settings"],
];

/** The URL path for a given view. `ALL_ID` is the root. */
export function viewToPath(view: string): string {
  if (view === ALL_ID) return "/";
  const reserved = RESERVED.find(([id]) => id === view);
  if (reserved) return `/${reserved[1]}`;
  return `/${encodeURIComponent(view)}`;
}

/** The view a URL path selects. The inverse of {@link viewToPath}. */
export function pathToView(pathname: string): string {
  const segment = pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  if (segment === "") return ALL_ID;
  const reserved = RESERVED.find(([, path]) => path === segment);
  if (reserved) return reserved[0];
  return decodeURIComponent(segment);
}

/**
 * Drop-in replacement for `useState<string>(ALL_ID)` that makes the URL the
 * source of truth for the current view. Initializes from the address bar,
 * pushes a history entry when the view changes, and follows back/forward.
 */
export function useRoutedView(): [string, (next: string) => void] {
  const [view, setView] = useState<string>(() =>
    pathToView(window.location.pathname),
  );

  useEffect(() => {
    const onPopState = () => setView(pathToView(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: string) => {
    if (viewToPath(next) !== window.location.pathname) {
      window.history.pushState(null, "", viewToPath(next));
    }
    setView(next);
  }, []);

  return [view, navigate];
}
