# Aside Agent Guidance

- For anchored popups, menus, and floating panels in the client, use `@floating-ui/react` instead of hand-positioned absolute elements. Reuse the local pattern with `useFloating`, `autoUpdate`, `offset`, `flip`, `shift`, `useDismiss`, `useRole`, and `FloatingPortal` so overlays stay correctly positioned and dismissible across desktop and mobile layouts.
