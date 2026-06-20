import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { createPortal } from "react-dom";

export interface MessageAction {
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Mobile long-press menu: a sheet that slides up from the bottom with the same
 * actions as the desktop hover bar (edit spaces, edit, copy, delete). Rendered
 * through a portal over a tap-to-dismiss scrim, mirroring SearchPalette's
 * overlay pattern. The hover bar is hover-only, so touch users reach actions
 * here instead.
 */
export function MessageActionSheet({
  actions,
  onClose,
}: {
  actions: MessageAction[];
  onClose: () => void;
}) {
  // Mount square, then flip to `shown` on the next frame so the panel animates
  // up from below and the scrim fades in.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-end bg-black/30 transition-opacity duration-200 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={onClose}
      onTouchStart={onClose}
    >
      <div
        role="menu"
        className={`mx-auto w-full max-w-md rounded-t-2xl bg-panel p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-divider transition-transform duration-200 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            onClick={() => {
              action.onSelect();
              onClose();
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-hover ${
              action.danger ? "text-danger" : "text-ink"
            }`}
          >
            <action.Icon className="h-5 w-5 shrink-0" />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
