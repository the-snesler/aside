import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Lightbox } from "./Lightbox";

/** One previewable image shown in the {@link Lightbox}. */
export interface LightboxImage {
  /** the image to display (a blob URL for attachments, an og:image for embeds) */
  src: string;
  /** filename, or an embed's title/site name */
  caption?: string;
  /** same-origin URL backing a real download button (attachments only) */
  downloadUrl?: string;
  /** external link offered as "Open original" (embeds only) */
  sourceUrl?: string;
}

interface LightboxApi {
  /** Open the viewer on `images`, focused on `startIndex`. */
  open: (images: LightboxImage[], startIndex: number) => void;
}

const LightboxContext = createContext<LightboxApi | null>(null);

/**
 * Provides a single app-wide image lightbox. Mounting one overlay here (rather
 * than per message) lets deeply-nested images — rendered inside the virtualized
 * message list — open it through {@link useLightbox} without prop drilling, the
 * same way the search palette is mounted once at the workspace level.
 */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);

  const open = useCallback((images: LightboxImage[], startIndex: number) => {
    if (images.length === 0) return;
    const clamped = Math.min(Math.max(startIndex, 0), images.length - 1);
    setState({ images, index: clamped });
  }, []);

  const close = useCallback(() => setState(null), []);

  const setIndex = useCallback((index: number) => {
    setState((current) => (current ? { ...current, index } : current));
  }, []);

  // Lock background scroll while the viewer is open.
  const isOpen = state !== null;
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const api = useMemo<LightboxApi>(() => ({ open }), [open]);

  return (
    <LightboxContext.Provider value={api}>
      {children}
      {state && (
        <Lightbox
          images={state.images}
          index={state.index}
          onIndexChange={setIndex}
          onClose={close}
        />
      )}
    </LightboxContext.Provider>
  );
}

/** Access the app-wide lightbox. Must be called under a {@link LightboxProvider}. */
export function useLightbox(): LightboxApi {
  const api = useContext(LightboxContext);
  if (!api)
    throw new Error("useLightbox must be used within a LightboxProvider");
  return api;
}
