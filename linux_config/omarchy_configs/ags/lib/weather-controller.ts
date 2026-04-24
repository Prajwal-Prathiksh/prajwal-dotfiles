import GLib from "gi://GLib?version=2.0"
import { run } from "./helpers"
import { WEATHER_AGS_SCRIPT } from "./paths"
import type { BarRefs, WeatherData, WeatherPanelRefs } from "./types"
import { parseWeatherData, withPrimaryWeatherCity } from "./weather-model"
import {
    applyWeatherData,
    scheduleWeatherPanelRelayout,
} from "./weather-view"

export type WeatherController = {
    update: () => Promise<void>
    refreshNow: () => Promise<void>
    addCity: (panel: WeatherPanelRefs) => Promise<void>
    handleScroll: (direction: "next" | "prev") => void
}

export function createWeatherController(bars: BarRefs[]): WeatherController {
    let lastWeatherData: WeatherData | null = null
    let pendingPrimaryId: string | null = null
    let primarySyncInFlight = false
    let desiredPrimaryId: string | null = null
    let requestToken = 0
    let latestAppliedToken = 0
    let lastScrollDirection: "next" | "prev" | null = null
    let lastScrollAtUsec = 0
    let scrollCooldownUntilUsec = 0

    // Weather can update from polling, manual refresh, add/remove, and optimistic city
    // switching. Tokens prevent stale script responses from replacing newer UI state,
    // while pendingPrimaryId serializes rapid primary-city writes to the shell state.
    function render(data: WeatherData, optimistic = false) {
        const actions = {
            setPrimaryCity: (cityId: string) => {
                void setPrimaryCity(cityId)
            },
            removeCity: (cityId: string) => {
                void removeCity(cityId)
            },
        }

        if (optimistic) {
            lastWeatherData = data
            applyWeatherData(bars, data, actions)
            return
        }

        let resolved = data
        if (desiredPrimaryId) {
            const hasDesiredCity = (data.cities ?? []).some((city) => city.id === desiredPrimaryId)
            if (hasDesiredCity) {
                const activeId = data.primary_city?.id
                if (activeId !== desiredPrimaryId) {
                    resolved = withPrimaryWeatherCity(data, desiredPrimaryId)
                }
            } else {
                desiredPrimaryId = null
            }
        }

        if (
            desiredPrimaryId &&
            data.primary_city?.id === desiredPrimaryId &&
            !primarySyncInFlight &&
            !pendingPrimaryId
        ) {
            desiredPrimaryId = null
        }

        lastWeatherData = resolved
        applyWeatherData(bars, resolved, actions)
    }

    async function runAction(args: string[]) {
        const token = ++requestToken
        const raw = await run([WEATHER_AGS_SCRIPT, ...args])
        const data = parseWeatherData(raw)

        if (token < latestAppliedToken) {
            return data
        }

        latestAppliedToken = token
        render(data)
        return data
    }

    async function update() {
        await runAction([])
    }

    async function refreshNow() {
        const data = await runAction(["--refresh"])
        if (data) {
            const body = data.error ? data.error : `${data.primary_city.title}   •   ${data.bar_text}`
            await run(["/usr/bin/notify-send", "Weather Updated", body, "-a", "AGS Weather"])
        }
    }

    async function syncPrimarySelection() {
        if (primarySyncInFlight) return
        primarySyncInFlight = true

        try {
            while (pendingPrimaryId) {
                const targetId = pendingPrimaryId
                pendingPrimaryId = null
                await runAction(["--set-primary", targetId])
            }
        } finally {
            primarySyncInFlight = false
            if (pendingPrimaryId) void syncPrimarySelection()
        }
    }

    function queuePrimarySelection(cityId: string) {
        pendingPrimaryId = cityId
        void syncPrimarySelection()
    }

    async function setPrimaryCity(cityId: string) {
        desiredPrimaryId = cityId
        if (lastWeatherData) render(withPrimaryWeatherCity(lastWeatherData, cityId), true)
        queuePrimarySelection(cityId)
    }

    async function removeCity(cityId: string) {
        await runAction(["--remove-city", cityId])
    }

    async function cycle(direction: "next" | "prev") {
        const cities = lastWeatherData?.cities ?? []
        if (cities.length <= 1) {
            await runAction(["--cycle", direction])
            return
        }

        const currentId = lastWeatherData?.primary_city?.id ?? cities[0]?.id
        const currentIndex = Math.max(0, cities.findIndex((city) => city.id === currentId))
        const offset = direction === "prev" ? -1 : 1
        const nextCity = cities[(currentIndex + offset + cities.length) % cities.length]
        if (!nextCity || !lastWeatherData) return

        desiredPrimaryId = nextCity.id
        render(withPrimaryWeatherCity(lastWeatherData, nextCity.id), true)
        queuePrimarySelection(nextCity.id)
    }

    function handleScroll(direction: "next" | "prev") {
        const nowUsec = GLib.get_monotonic_time()
        const baseCooldownUsec = 140_000
        const reboundCooldownUsec = 220_000
        const withinCooldownWindow = nowUsec < scrollCooldownUntilUsec
        if (withinCooldownWindow) {
            if (lastScrollDirection && lastScrollDirection !== direction) {
                scrollCooldownUntilUsec = nowUsec + reboundCooldownUsec
            }
            return
        }

        const withinBounceWindow = nowUsec - lastScrollAtUsec < reboundCooldownUsec
        if (withinBounceWindow && lastScrollDirection && lastScrollDirection !== direction) return

        lastScrollDirection = direction
        lastScrollAtUsec = nowUsec
        scrollCooldownUntilUsec = nowUsec + baseCooldownUsec
        void cycle(direction)
    }

    async function addCity(panel: WeatherPanelRefs) {
        const query = panel.addEntry.get_text().trim()
        if (!query) {
            panel.message.set_label("Type a city name first.")
            panel.message.set_visible(true)
            panel.addRevealer.set_reveal_child(true)
            panel.addTriggerLabel.set_label("󰅖")
            panel.addTrigger.set_visible(true)
            scheduleWeatherPanelRelayout(panel)
            return
        }

        panel.message.set_label(`Adding ${query}…`)
        panel.message.set_visible(true)
        const data = await runAction(["--add-city", query])
        if (data.action_status === "added") {
            panel.addEntry.set_text("")
            panel.addRevealer.set_reveal_child(false)
            panel.addTriggerLabel.set_label("󰐕")
            panel.addTrigger.set_visible(false)
            scheduleWeatherPanelRelayout(panel)
        }
    }

    return {
        update,
        refreshNow,
        addCity,
        handleScroll,
    }
}
