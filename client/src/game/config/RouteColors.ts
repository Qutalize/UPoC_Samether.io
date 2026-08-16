/**
 * RouteColors.ts
 *
 * Centralized color configuration for shark routes.
 * Used across territories, trails, and UI elements.
 */

import type { SharkRoute } from "../../network/protocol";
 
export const ROUTE_COLORS: Record<SharkRoute, number> = {
  "attack": 0xff6666,     // Red
  "non-attack": 0x66ccff, // Blue
  "deep-sea": 0xbb66ff,   // Purple
  "human": 0xffcc88,      // Orange/Peach
};

export const ROUTE_COLORS_HEX: Record<SharkRoute, string> = {
  "attack": "#ff6666",
  "non-attack": "#66ccff",
  "deep-sea": "#bb66ff",
  "human": "#ffcc88",
};

/**
 * Get route color as number (0xRRGGBB)
 */
export function getRouteColor(route: SharkRoute): number {
  return ROUTE_COLORS[route];
}

/**
 * Get route color as hex string (#RRGGBB)
 */
export function getRouteColorHex(route: SharkRoute): string {
  return ROUTE_COLORS_HEX[route];
}

/**
 * Orange color for dangerous territories (higher level)
 */
export const DANGER_COLOR = 0xff6600;
export const DANGER_COLOR_HEX = "#ff6600";
