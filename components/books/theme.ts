// AG Studio theme for Books: "ledger paper". Every colour points at a variable from app/globals.css,
// so Studio's canvas, widgets, grids and charts follow the rest of Tranche.

import { studioTheme } from "ag-studio";

const v = (name: string) => `var(--${name})`;
const line = (color: string) => ({ width: 1, color: v(color) });

const SANS = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

/**
 * Chart palette, in the order series are drawn. The default dashboard relies on the first five:
 * paid, invoiced or ready, overdue, held, locked.
 */
export const BOOKS_PALETTE = [
  "#0b6e4f", // green: paid
  "#b7791f", // amber: invoiced, ready, owed
  "#b42318", // red: overdue, blocked
  "#3b5bdb", // blue: held
  "#b9b5aa", // warm grey: locked
  "#16181d", // ink
  "#5fa58c", // soft green
  "#d9ab5c", // soft amber
  "#8a8f99", // slate
  "#8fa2ea", // soft blue
];

const palette = Object.fromEntries(
  BOOKS_PALETTE.flatMap((color, i) => [
    [`chartPaletteFills${i + 1}Color`, color],
    [`chartPaletteStrokes${i + 1}Color`, color],
  ]),
);

export const booksTheme = studioTheme.withParams({
  // Shared by Studio's own UI, grids and charts.
  fontFamily: SANS,
  fontSize: 13,
  textColor: v("ink"),
  foregroundColor: v("ink"),
  subtleTextColor: v("ink-3"),
  backgroundColor: v("card"),
  borderColor: v("line"),
  accentColor: v("green"),
  iconColor: v("ink-2"),
  rowHoverColor: v("paper"),

  // No frame of its own: the canvas is the paper the page is made of.
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: v("paper"),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: v("paper"),
  studioCanvasPadding: 12,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: SANS,

  // Widgets are white cards with a thin warm border.
  studioWidgetBackgroundColor: v("card"),
  studioWidgetBorder: line("line"),
  studioWidgetBorderRadius: 10,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: SANS,
  studioWidgetTitleFontSize: 13,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: v("ink"),
  studioWidgetSubtitleFontFamily: SANS,
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: v("ink-3"),
  studioWidgetCaptionFontFamily: SANS,
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: v("ink-3"),
  studioWidgetResizeBorderColor: v("green"),

  // Side panels (assistant, compose, data, filters).
  studioPanelContainerBackgroundColor: v("card"),
  studioPanelContainerBorder: line("line"),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: v("line"),
  studioPanelDividerActiveColor: v("green"),
  studioPanelSectionBorderColor: v("line"),
  studioPanelHeaderFontFamily: SANS,
  studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: v("paper-2"),
  studioPanelChevronButtonHoverColor: v("green"),
  studioToggleButtonActiveBackgroundColor: v("green-soft"),
  studioToggleButtonActiveBorderColor: v("green"),
  studioToggleButtonActiveColor: v("green"),

  // Grids: quiet headers, hairline rows.
  gridFontFamily: SANS,
  gridFontSize: 13,
  gridCellTextColor: v("ink"),
  gridHeaderBackgroundColor: v("card"),
  gridHeaderTextColor: v("ink-3"),
  gridHeaderFontWeight: 500,
  gridHeaderFontSize: 12,
  gridRowHeight: 36,
  gridRowBorder: line("line"),
  gridHeaderRowBorder: line("line"),
  gridPinnedRowBorder: line("line"),
  gridRowHoverColor: v("paper"),
  gridWrapperBorder: false,

  // Charts.
  chartFontFamily: SANS,
  chartTextColor: v("ink-2"),
  chartSubtleTextColor: v("ink-3"),
  chartAxisLineColor: v("line"),
  chartGridLineColor: v("line"),
  ...palette,
});
