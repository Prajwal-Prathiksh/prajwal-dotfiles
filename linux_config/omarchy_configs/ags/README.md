# Omarchy Top Bar

Custom AGS GTK4 top bar for an Omarchy/Hyprland desktop. The app runs as the AGS instance `omarchy-top-bar`, creates one bar window per monitor, and updates existing GTK widgets from pollers and event streams instead of rebuilding the UI on every tick.

## Features

- Hyprland workspace strip with active workspace highlighting.
- Weather module with saved cities, auto location, popup panel, city add/remove, manual refresh, and scroll-to-cycle.
- Local clock and India clock.
- Privacy indicators for microphone, camera, and screen capture.
- Recording, idle, notification-silencing, update, and Voxtype status indicators.
- Bluetooth, network, audio, brightness, CPU, memory, and battery modules.
- Scroll audio volume and brightness directly from the bar.
- Theme-aware glass styling sourced from Omarchy theme colors.

## Entry Points

- `app.ts`: AGS entrypoint. Creates controllers, builds monitor bars, starts pollers, and connects event streams.
- `restart.sh`: stops the current `omarchy-top-bar` instance and starts `ags run app.ts --gtk 4`.
- `style.css`: GTK CSS for the bar, tooltips, and weather popup.
- `weather-state.json`: saved weather city state.
- `weather-popup.trigger`: file-based trigger used by external scripts/keybindings to open the weather popup.

## TypeScript Layout

- `lib/bar.ts`: builds the bar windows and widget layout: left workspace area, center weather/clocks/status area, and right system modules.
- `lib/types.ts`: shared TypeScript shapes for bar refs, weather data, and system payloads.
- `lib/widgets.ts`: small GTK widget helpers such as module buttons, labels, scroll/right-click handlers, capsules, and window margins.
- `lib/theme.ts`: reads Omarchy theme files, generates GTK CSS variables, and applies `style.css`.
- `lib/paths.ts`: centralizes local script/config paths.
- `lib/helpers.ts`: command execution, safe file reads, JSON fallback parsing, polling, and small formatting helpers.

## Controllers

- `lib/workspaces-controller.ts`: Hyprland socket subscription, workspace rendering, and monitor-change restart handling.
- `lib/audio-controller.ts`: `pactl subscribe`, audio refreshes, mute toggle, and scroll volume coalescing.
- `lib/system-controller.ts`: clocks, network, Bluetooth, CPU, memory, battery, brightness, privacy, and status indicator updates.
- `lib/weather-controller.ts`: weather script calls, optimistic city switching, refresh/add/remove actions, and scroll cycling.
- `lib/weather-popup-controller.ts`: watches `weather-popup.trigger` and opens the weather popup on the requested monitor.

## Weather Modules

- `lib/weather-model.ts`: pure weather data helpers: fallback data, JSON parsing, and primary-city switching.
- `lib/weather-view.ts`: GTK weather popup/window rendering and applying weather data to existing widgets.
- `scripts/weather-ags.sh`: shell entrypoint for weather state/actions/rendering.
- `scripts/weather/state.sh`: saved city state, add/remove/set/cycle behavior.
- `scripts/weather/cache.sh`: wttr.in fetches and cache files under `${XDG_CACHE_HOME:-$HOME/.cache}/ags-weather`.
- `scripts/weather/render.sh`: converts wttr.in JSON into the TypeScript-facing weather JSON schema.
- `scripts/weather/helpers.sh`: weather string/time/icon helpers.
- `scripts/weather/common.sh`: shared weather constants and action globals.

## Helper Scripts

- `scripts/cpu-ags.sh`: emits CPU usage/load/core JSON for the CPU module.
- `scripts/memory-ags.sh`: emits memory/swap/top-process JSON for the memory module.
- `../hypr/scripts/audio-osd.sh`: called by the audio controller to change volume/mute and show SwayOSD.

## Runtime Model

The bar uses both polling and event streams:

- Clocks and privacy update every second.
- Brightness, indicators, weather, audio, network, CPU, memory, and battery update on slower polling intervals.
- Hyprland workspaces update from Hyprland socket events.
- Audio updates from `pactl subscribe`.
- Brightness also watches backlight sysfs files.
- Weather popup opening is triggered by writes to `weather-popup.trigger`.

Most command failures degrade quietly to fallback text or hidden indicators so the bar keeps running even if a dependency is temporarily missing.
