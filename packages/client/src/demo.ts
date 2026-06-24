import { createContext, useContext } from "react";

/**
 * Whether this client is talking to a public-demo server (reported by
 * `/api/auth/status`). Drives the demo banner and disables the surfaces the
 * server locks down (uploads, feeds, AI, account settings), so a visitor never
 * meets a control that just 403s.
 */
export const DemoContext = createContext(false);

export function useIsDemo(): boolean {
  return useContext(DemoContext);
}
