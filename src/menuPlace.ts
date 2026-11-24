// KB-88 Where an open ⋯ menu goes (components/ViewActions.tsx draws it in its own layer, position: fixed): under its
// button, right-aligned with it; above it when there is no room below and more room above; kept inside the window on
// every side (left-aligned with the button when it would run out on the left); a menu taller than the room scrolls
// inside (`maxHeight`). Pure (tests/chart-grid.test.mjs).
export interface Rect { top: number; bottom: number; left: number; right: number }
export const menuEdge = 8, menuGap = 4
export function menuPlace(button: Rect, menu: { width: number; height: number }, view: { width: number; height: number }) {
  const below = view.height - menuEdge - (button.bottom + menuGap), above = button.top - menuGap - menuEdge
  const up = menu.height > below && above > below
  const room = Math.max(80, up ? above : below)
  const height = Math.min(menu.height, room)
  const top = up ? button.top - menuGap - height : Math.min(button.bottom + menuGap, Math.max(menuEdge, view.height - menuEdge - height))
  let left = button.right - menu.width
  if (left < menuEdge) left = button.left
  left = Math.max(menuEdge, Math.min(left, view.width - menuEdge - menu.width))
  return { top: Math.round(top), left: Math.round(left), maxHeight: Math.floor(room), up }
}
