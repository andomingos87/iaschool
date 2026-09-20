/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f8fafc",
      "foreground": "#0f2747",
      "border": "#d9e2f0",
      "card": "#ffffff",
      "cardForeground": "#0f2747",
      "popover": "#ffffff",
      "popoverForeground": "#0f2747",
      "primary": "#2563eb",
      "primaryForeground": "#ffffff",
      "secondary": "#e7eef9",
      "secondaryForeground": "#183b68",
      "muted": "#eef3fa",
      "mutedForeground": "#5d718d",
      "accent": "#e8efff",
      "accentForeground": "#1e4fb3",
      "destructive": "#be123c",
      "destructiveForeground": "#ffffff",
      "input": "#c9d7ea",
      "ring": "#2563eb",
      "chart1": "#2563eb",
      "chart2": "#be123c",
      "chart3": "#0f8acb",
      "chart4": "#24466f",
      "chart5": "#93c5fd",
      "sidebar": "#ffffff",
      "sidebarForeground": "#0f2747",
      "sidebarBorder": "#d9e2f0",
      "sidebarPrimary": "#2563eb",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#eef3fa",
      "sidebarAccentForeground": "#0f2747",
      "sidebarRing": "#2563eb"
    },
    "dark": {
      "background": "#071426",
      "foreground": "#edf4ff",
      "border": "#19365b",
      "card": "#0c203b",
      "cardForeground": "#edf4ff",
      "popover": "#102744",
      "popoverForeground": "#edf4ff",
      "primary": "#60a5fa",
      "primaryForeground": "#071426",
      "secondary": "#193b66",
      "secondaryForeground": "#dbeafe",
      "muted": "#132d4e",
      "mutedForeground": "#9db1cc",
      "accent": "#163967",
      "accentForeground": "#dbeafe",
      "destructive": "#fb7185",
      "destructiveForeground": "#ffffff",
      "input": "#23466f",
      "ring": "#60a5fa",
      "chart1": "#60a5fa",
      "chart2": "#fb7185",
      "chart3": "#22b8e8",
      "chart4": "#b9d5fb",
      "chart5": "#1d4ed8",
      "sidebar": "#08192f",
      "sidebarForeground": "#e4efff",
      "sidebarBorder": "#173454",
      "sidebarPrimary": "#60a5fa",
      "sidebarPrimaryForeground": "#071426",
      "sidebarAccent": "#102744",
      "sidebarAccentForeground": "#e4efff",
      "sidebarRing": "#60a5fa"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "ui-sans-serif",
      "system-ui",
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
