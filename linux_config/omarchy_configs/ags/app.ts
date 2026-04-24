import App from "ags/gtk4/app"
import { buildBar } from "./lib/bar"
import { createAudioController } from "./lib/audio-controller"
import { poll } from "./lib/helpers"
import { createSystemController } from "./lib/system-controller"
import { applyDynamicCss, watchStyle } from "./lib/theme"
import type { BarRefs } from "./lib/types"
import { createWeatherController } from "./lib/weather-controller"
import { createWeatherPopupController } from "./lib/weather-popup-controller"
import { createWorkspacesController } from "./lib/workspaces-controller"

// The bar is built once per monitor, stores widget refs, then mutates those
// widgets from pollers and event streams. This keeps GTK reconstruction rare
// and makes normal updates cheap.
const bars: BarRefs[] = []
const weather = createWeatherController(bars)
const audio = createAudioController(bars)
const system = createSystemController(bars)
const workspaces = createWorkspacesController(bars)
const weatherPopup = createWeatherPopupController(bars)

function startPollers() {
    poll(1, system.refreshClocks)
    poll(10, system.updateNetwork)
    poll(10, system.updateCpu)
    poll(10, system.updateMemory)
    poll(10, system.updateBattery)
    poll(5, system.updateBrightness)
    poll(1, system.updatePrivacy)
    poll(8, system.updateIndicators)
    poll(60, weather.update)
    poll(30, audio.update)
}

App.start({
    instanceName: "omarchy-top-bar",
    main() {
        applyDynamicCss()
        watchStyle()

        const monitors = App.get_monitors()
        const count = Math.max(monitors.length, 1)

        for (let index = 0; index < count; index += 1) {
            App.add_window(buildBar(index, bars, {
                addWeatherCity: (panel) => {
                    void weather.addCity(panel)
                },
                refreshWeatherNow: () => {
                    void weather.refreshNow()
                },
                handleWeatherScroll: weather.handleScroll,
                toggleRecording: system.toggleRecording,
                toggleAudioMute: audio.toggleMute,
                scrollAudio: audio.scroll,
                toggleNightLight: system.toggleNightLight,
                scrollBrightness: system.scrollBrightness,
            }))
        }

        startPollers()
        void system.connectBrightnessWatch()
        audio.connectEvents()
        weatherPopup.connect()
        void workspaces.update()
        workspaces.connectEvents()
    },
})
