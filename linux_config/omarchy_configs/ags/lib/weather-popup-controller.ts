import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { WEATHER_POPUP_TRIGGER } from "./paths"
import type { BarRefs } from "./types"
import { parseJson, safeRead } from "./helpers"
import { toggleWeatherWindow } from "./weather-view"

type WeatherPopupTrigger = {
    token?: string
    monitor?: number
    monitorName?: string
}

export type WeatherPopupController = {
    connect: () => void
}

export function createWeatherPopupController(bars: BarRefs[]): WeatherPopupController {
    let monitorRef: Gio.FileMonitor | null = null
    let triggerTimer = 0
    let lastToken = ""

    function toggleWeatherForBar(refs: BarRefs) {
        const panel = refs.weather.weatherPanel
        const anchorButton = panel.anchorButton
        const shell = panel.shell
        const monitorWidth = panel.monitorWidth
        const panelWidth = panel.panelWidth
        if (!anchorButton || !shell || !monitorWidth || !panelWidth) return

        toggleWeatherWindow(bars, panel, anchorButton, shell, monitorWidth, panelWidth)
    }

    function handleTrigger() {
        const raw = safeRead(WEATHER_POPUP_TRIGGER)
        if (!raw) return

        const trigger = parseJson<WeatherPopupTrigger>(raw, {})
        if (!trigger.token || trigger.token === lastToken) return
        lastToken = trigger.token

        const target = bars.find((refs) =>
            (trigger.monitorName && refs.monitorName === trigger.monitorName)
            || (typeof trigger.monitor === "number" && refs.monitor === trigger.monitor),
        ) ?? bars[0]

        if (target) toggleWeatherForBar(target)
    }

    function connect() {
        const file = Gio.File.new_for_path(WEATHER_POPUP_TRIGGER)

        try {
            file.get_parent()?.make_directory_with_parents(null)
        } catch {}

        try {
            if (!file.query_exists(null)) {
                file.replace_contents("", null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null)
            }
        } catch {}

        try {
            const monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null)
            monitor.connect("changed", (_monitor, _file, _otherFile, eventType) => {
                if (
                    eventType !== Gio.FileMonitorEvent.CHANGED
                    && eventType !== Gio.FileMonitorEvent.CHANGES_DONE_HINT
                    && eventType !== Gio.FileMonitorEvent.CREATED
                    && eventType !== Gio.FileMonitorEvent.MOVED_IN
                ) return

                if (triggerTimer) GLib.source_remove(triggerTimer)
                triggerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
                    triggerTimer = 0
                    handleTrigger()
                    return GLib.SOURCE_REMOVE
                })
            })
            monitorRef = monitor
        } catch {}
    }

    return {
        connect,
    }
}
