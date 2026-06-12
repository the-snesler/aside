import { useDrag } from "@use-gesture/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IconChevronLeft from "~icons/lucide/chevron-left";
import IconChevronRight from "~icons/lucide/chevron-right";
import IconDownload from "~icons/lucide/download";
import IconExternalLink from "~icons/lucide/external-link";
import IconX from "~icons/lucide/x";
import type { LightboxImage } from "./LightboxProvider";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_CLICK_SCALE = 2;

interface Props {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Fullscreen image viewer. Portaled to `document.body` so the workspace's
 * transformed content layer (which would otherwise capture a `position: fixed`
 * overlay as its containing block) can't clip it. Supports wheel/double-click
 * zoom and drag-to-pan, plus keyboard + on-screen navigation across the set.
 */
export function Lightbox({ images, index, onIndexChange, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const total = images.length;
  const image = images[index];

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback(
    (next: number) => onIndexChange((next + total) % total),
    [onIndexChange, total],
  );

  // Reset the zoom/pan transform whenever we move to a different image.
  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

  // Focus the close button on open so Tab/Enter land somewhere sensible.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, goTo, onClose]);

  const bindDrag = useDrag(
    ({ active, offset: [x, y] }) => {
      setDragging(active);
      setOffset({ x, y });
    },
    {
      enabled: scale > 1,
      from: () => [offset.x, offset.y],
      filterTaps: true,
    },
  );

  function handleWheel(e: React.WheelEvent) {
    const nextScale = clamp(
      scale + (e.deltaY < 0 ? 0.25 : -0.25),
      MIN_SCALE,
      MAX_SCALE,
    );
    setScale(nextScale);
    if (nextScale === 1) setOffset({ x: 0, y: 0 });
  }

  function toggleZoom() {
    if (scale > 1) resetZoom();
    else setScale(DOUBLE_CLICK_SCALE);
  }

  if (!image) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close preview"
        className="absolute right-3 top-3 rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <IconX className="h-5 w-5" />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goTo(index - 1);
            }}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <IconChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goTo(index + 1);
            }}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <IconChevronRight className="h-7 w-7" />
          </button>
        </>
      )}

      <img
        {...bindDrag()}
        src={image.src}
        alt={image.caption ?? ""}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
        onWheel={handleWheel}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging ? "none" : "transform 0.15s ease-out",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
          touchAction: "none",
        }}
        className="max-h-[90vh] max-w-[90vw] select-none rounded-lg object-contain shadow-2xl"
      />

      {(image.caption || total > 1 || image.downloadUrl || image.sourceUrl) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur-sm"
        >
          {image.caption && (
            <span className="max-w-[50vw] truncate">{image.caption}</span>
          )}
          {total > 1 && (
            <span className="tabular-nums text-white/60">
              {index + 1} / {total}
            </span>
          )}
          {image.downloadUrl ? (
            <a
              href={image.downloadUrl}
              download={image.caption}
              aria-label="Download image"
              className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <IconDownload className="h-4 w-4" />
            </a>
          ) : (
            image.sourceUrl && (
              <a
                href={image.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <IconExternalLink className="h-4 w-4" />
                <span>Open original</span>
              </a>
            )
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
