/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f7f8f9",
      "foreground": "#2e2e2e",
      "border": "#dde1e6",
      "card": "#ffffff",
      "cardForeground": "#2e2e2e",
      "popover": "#ffffff",
      "popoverForeground": "#2e2e2e",
      "primary": "#39ff14",
      "primaryForeground": "#12210d",
      "secondary": "#7e8a97",
      "secondaryForeground": "#ffffff",
      "muted": "#eef0f3",
      "mutedForeground": "#67727e",
      "accent": "#e4fbdd",
      "accentForeground": "#186007",
      "destructive": "#dc2626",
      "destructiveForeground": "#ffffff",
      "input": "#d4d9df",
      "ring": "#22b30b",
      "chart1": "#2fd611",
      "chart2": "#7e8a97",
      "chart3": "#188a06",
      "chart4": "#4b545e",
      "chart5": "#a9e59c",
      "sidebar": "#ffffff",
      "sidebarForeground": "#2e2e2e",
      "sidebarBorder": "#dde1e6",
      "sidebarPrimary": "#39ff14",
      "sidebarPrimaryForeground": "#12210d",
      "sidebarAccent": "#eef0f3",
      "sidebarAccentForeground": "#2e2e2e",
      "sidebarRing": "#22b30b"
    },
    "dark": {
      "background": "#1c1c1c",
      "foreground": "#f2f4f5",
      "border": "#3a3a3a",
      "card": "#2e2e2e",
      "cardForeground": "#f2f4f5",
      "popover": "#262626",
      "popoverForeground": "#f2f4f5",
      "primary": "#39ff14",
      "primaryForeground": "#12210d",
      "secondary": "#7e8a97",
      "secondaryForeground": "#14181c",
      "muted": "#333333",
      "mutedForeground": "#9aa4ae",
      "accent": "#22391b",
      "accentForeground": "#a4f78f",
      "destructive": "#ef4444",
      "destructiveForeground": "#ffffff",
      "input": "#414141",
      "ring": "#39ff14",
      "chart1": "#39ff14",
      "chart2": "#7e8a97",
      "chart3": "#1fb903",
      "chart4": "#c3ccd4",
      "chart5": "#87f56d",
      "sidebar": "#141414",
      "sidebarForeground": "#e8ebee",
      "sidebarBorder": "#2c2c2c",
      "sidebarPrimary": "#39ff14",
      "sidebarPrimaryForeground": "#12210d",
      "sidebarAccent": "#262626",
      "sidebarAccentForeground": "#e8ebee",
      "sidebarRing": "#39ff14"
    }
  },
  "fontFamily": {
    "sans": [
      "Prometo",
      "DM Sans",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "JetBrains Mono",
      "Menlo",
      "monospace"
    ]
  },
  "radius": "0.5rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
