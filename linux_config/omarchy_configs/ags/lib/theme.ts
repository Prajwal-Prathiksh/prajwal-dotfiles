import { monitorFile } from "ags/file"
import App from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
import { hexToRgba, safeRead } from "./helpers"
import { AGS_STYLE, LIGHT_MODE_FILE, THEME_COLORS } from "./paths"
import type { Theme } from "./types"

function parseTheme(): Theme {
    const colors: Theme = {}
    const raw = safeRead(THEME_COLORS)
    for (const line of raw.split("\n")) {
        const match = line.match(/^([a-zA-Z0-9_]+)\s*=\s*"(#?[0-9a-fA-F]+)"/)
        if (match) colors[match[1]] = match[2]
    }
    return colors
}

export function applyDynamicCss() {
    const theme = parseTheme()
    const isLight = GLib.file_test(LIGHT_MODE_FILE, GLib.FileTest.EXISTS)
    const glass = isLight ? 0.56 : 0.26
    const glassStrong = isLight ? 0.8 : 0.4
    const glassSoft = isLight ? 0.24 : 0.18
    const stroke = isLight ? 0.16 : 0.28
    const strokeStrong = isLight ? 0.24 : 0.38
    const tint = isLight ? 0.12 : 0.18
    const shadow = isLight ? 0.16 : 0.3
    const glow = isLight ? 0.08 : 0.16
    const tooltipBg = isLight
        ? hexToRgba(theme.background ?? "#eff1f5", 0.96)
        : hexToRgba(theme.background ?? "#11111b", 0.92)
    const tooltipBorder = isLight
        ? hexToRgba(theme.foreground ?? "#4c4f69", 0.22)
        : hexToRgba(theme.foreground ?? "#cdd6f4", 0.26)
    const css = [
        `@define-color mode_fg ${isLight ? "#ffffff" : "#000000"};`,
        `@define-color fg ${theme.foreground ?? "#4c4f69"};`,
        `@define-color bg ${theme.background ?? "#eff1f5"};`,
        `@define-color accent ${theme.accent ?? "#1e66f5"};`,
        `@define-color success ${theme.color10 ?? "#40a02b"};`,
        `@define-color warn ${theme.color11 ?? "#df8e1d"};`,
        `@define-color danger ${theme.color9 ?? "#d20f39"};`,
        `@define-color glass ${hexToRgba(theme.background ?? "#eff1f5", glass)};`,
        `@define-color glass-strong ${hexToRgba(theme.background ?? "#eff1f5", glassStrong)};`,
        `@define-color glass-soft ${hexToRgba(theme.background ?? "#eff1f5", glassSoft)};`,
        `@define-color stroke ${hexToRgba(theme.foreground ?? "#4c4f69", stroke)};`,
        `@define-color stroke-strong ${hexToRgba(theme.foreground ?? "#4c4f69", strokeStrong)};`,
        `@define-color tint ${hexToRgba(theme.accent ?? "#1e66f5", tint)};`,
        `@define-color shadow ${hexToRgba("#000000", shadow)};`,
        `@define-color glow ${hexToRgba(theme.accent ?? "#1e66f5", glow)};`,
        `@define-color tooltip_bg ${tooltipBg};`,
        `@define-color tooltip_border ${tooltipBorder};`,
        "",
        safeRead(AGS_STYLE),
    ].join("\n")
    App.apply_css(css, true)
}

export function watchStyle() {
    monitorFile(AGS_STYLE, () => applyDynamicCss())
}
