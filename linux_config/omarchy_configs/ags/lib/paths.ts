import GLib from "gi://GLib?version=2.0"

export const HOME = GLib.get_home_dir()
export const AGS_STYLE = `${HOME}/.config/ags/style.css`
export const THEME_DIR = `${HOME}/.config/omarchy/current/theme`
export const THEME_COLORS = `${HOME}/.config/omarchy/current/theme/colors.toml`
export const LIGHT_MODE_FILE = `${HOME}/.config/omarchy/current/theme/light.mode`
export const WEATHER_AGS_SCRIPT = `${HOME}/.config/ags/scripts/weather-ags.sh`
export const CPU_SCRIPT = `${HOME}/.config/ags/scripts/cpu-ags.sh`
export const MEMORY_SCRIPT = `${HOME}/.config/ags/scripts/memory-ags.sh`
export const SCREENREC_SCRIPT =
    `${HOME}/.local/share/omarchy/default/waybar/indicators/screen-recording.sh`
export const IDLE_SCRIPT = `${HOME}/.local/share/omarchy/default/waybar/indicators/idle.sh`
export const NOTIF_SCRIPT =
    `${HOME}/.local/share/omarchy/default/waybar/indicators/notification-silencing.sh`
