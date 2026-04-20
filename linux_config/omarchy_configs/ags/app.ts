import { Astal, Gdk, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import Pango from "gi://Pango?version=1.0"
import { compact, parseJson, poll, run, spawn } from "./lib/helpers"
import { CPU_SCRIPT, HOME, IDLE_SCRIPT, MEMORY_SCRIPT, NOTIF_SCRIPT, SCREENREC_SCRIPT, WEATHER_AGS_SCRIPT } from "./lib/paths"
import { getAudioInfo, getBatteryInfo, getBluetoothInfo, getBrightnessInfo, getBrightnessWatchPaths, getNetworkInfo, getPrivacyInfo, indiaClockText, localClockText } from "./lib/system"
import { applyDynamicCss, watchStyle } from "./lib/theme"
import type { BarRefs, WeatherCityData, WeatherData, WeatherPanelRefs } from "./lib/types"
import { addRightClick, addScroll, capsule, moduleButton, moduleLabel, setTooltip, setWindowMargins, valueLabel, workspaceButton } from "./lib/widgets"

const bars: BarRefs[] = []
let hyprSocketStream: Gio.DataInputStream | null = null
const brightnessMonitors: Gio.FileMonitor[] = []
let monitorRefreshTimer = 0
let audioSubscribeProcess: Gio.Subprocess | null = null
let audioSubscribeStream: Gio.DataInputStream | null = null
let audioRefreshTimer = 0
let lastWeatherData: WeatherData | null = null
let pendingWeatherPrimaryId: string | null = null
let weatherPrimarySyncInFlight = false

function schedulePrivacyRefresh() {
    ;[80, 220, 500, 900].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            void updatePrivacy()
            return GLib.SOURCE_REMOVE
        })
    })
}

function scheduleBrightnessRefresh() {
    ;[50, 140, 260].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            void updateBrightness()
            return GLib.SOURCE_REMOVE
        })
    })
}

function scheduleAudioRefresh() {
    if (audioRefreshTimer) GLib.source_remove(audioRefreshTimer)
    audioRefreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
        void updateAudio()
        audioRefreshTimer = 0
        return GLib.SOURCE_REMOVE
    })
}

function scheduleBarRestart() {
    if (monitorRefreshTimer) return
    monitorRefreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        spawn([`${HOME}/.config/ags/restart.sh`])
        monitorRefreshTimer = 0
        return GLib.SOURCE_REMOVE
    })
}

async function connectBrightnessWatch() {
    const paths = await getBrightnessWatchPaths()
    paths.forEach((path) => {
        try {
            const monitor = Gio.File.new_for_path(path).monitor_file(Gio.FileMonitorFlags.NONE, null)
            monitor.connect("changed", () => {
                scheduleBrightnessRefresh()
            })
            brightnessMonitors.push(monitor)
        } catch {}
    })
}

function connectHyprlandEvents() {
    const runtimeDir = GLib.getenv("XDG_RUNTIME_DIR")
    const signature = GLib.getenv("HYPRLAND_INSTANCE_SIGNATURE")
    if (!runtimeDir || !signature) return

    const socketPath = `${runtimeDir}/hypr/${signature}/.socket2.sock`
    const address = Gio.UnixSocketAddress.new(socketPath)
    const client = new Gio.SocketClient()

    client.connect_async(address, null, (_client, result) => {
        try {
            const connection = client.connect_finish(result)
            const stream = Gio.DataInputStream.new(connection.get_input_stream())
            hyprSocketStream = stream

            const readNext = () => {
                stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_stream, res) => {
                    try {
                        const [line] = stream.read_line_finish_utf8(res)
                        if (line === null) {
                            hyprSocketStream = null
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                                connectHyprlandEvents()
                                return GLib.SOURCE_REMOVE
                            })
                            return
                        }

                        if (
                            line.startsWith("workspace") ||
                            line.startsWith("focusedmon") ||
                            line.startsWith("createworkspace") ||
                            line.startsWith("destroyworkspace") ||
                            line.startsWith("moveworkspace") ||
                            line.startsWith("renameworkspace")
                        ) {
                            void updateWorkspaces()
                        }

                        if (
                            line.startsWith("monitoradded") ||
                            line.startsWith("monitorremoved") ||
                            line.startsWith("monitoraddedv2")
                        ) {
                            scheduleBarRestart()
                        }

                        readNext()
                    } catch {
                        hyprSocketStream = null
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            connectHyprlandEvents()
                            return GLib.SOURCE_REMOVE
                        })
                    }
                })
            }

            readNext()
        } catch {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                connectHyprlandEvents()
                return GLib.SOURCE_REMOVE
            })
        }
    })
}

function connectAudioEvents() {
    try {
        const process = Gio.Subprocess.new(
            ["bash", "-lc", "pactl subscribe 2>/dev/null"],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
        )
        const stdout = process.get_stdout_pipe()
        if (!stdout) return

        const stream = new Gio.DataInputStream({ base_stream: stdout })
        audioSubscribeProcess = process
        audioSubscribeStream = stream

        const readNext = () => {
            stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_stream, res) => {
                try {
                    const [line] = stream.read_line_finish_utf8(res)
                    if (line === null) {
                        audioSubscribeProcess = null
                        audioSubscribeStream = null
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                            connectAudioEvents()
                            return GLib.SOURCE_REMOVE
                        })
                        return
                    }

                    if (
                        line.includes("on sink") ||
                        line.includes("on server") ||
                        line.includes("on sink-input")
                    ) {
                        scheduleAudioRefresh()
                    }

                    readNext()
                } catch {
                    audioSubscribeProcess = null
                    audioSubscribeStream = null
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        connectAudioEvents()
                        return GLib.SOURCE_REMOVE
                    })
                }
            })
        }

        readNext()
    } catch {}
}

async function updateWorkspaces() {
    const [workspacesRaw, activeRaw] = await Promise.all([
        run(["hyprctl", "workspaces", "-j"]),
        run(["hyprctl", "activeworkspace", "-j"]),
    ])

    const workspaces = parseJson<Array<{ id: number }>>(workspacesRaw, [])
    const active = parseJson<{ id?: number }>(activeRaw, {}).id ?? 1
    const visible = Array.from(new Set([active, ...workspaces.map((workspace) => workspace.id)]))
        .filter((id) => id > 0)
        .sort((a, b) => a - b)

    for (const refs of bars) {
        let child = refs.workspaceBox.get_first_child()
        while (child) {
            const next = child.get_next_sibling()
            refs.workspaceBox.remove(child)
            child = next
        }

        visible.forEach((id) => {
            const { button } = workspaceButton(id, () =>
                spawn(["hyprctl", "dispatch", "workspace", String(id)]),
            )
            if (id === active) button.add_css_class("active")
            refs.workspaceBox.append(button)
        })
    }
}

function weatherFallbackData(): WeatherData {
    const primaryCity: WeatherCityData = {
        id: "auto",
        query: "auto",
        title: "Current Location",
        location: "Weather unavailable",
        icon: "󰖪",
        temp_c: "--",
        feels_like_c: "--",
        wind_kmh: "--",
        condition: "Offline",
        local_time: "",
        updated_at: "Unavailable",
        sunrise: "",
        sunset: "",
        forecast: [],
        bar_text: "󰖪 --",
        removable: false,
        is_auto: true,
        is_primary: true,
        error: "Check network or wttr.in availability.",
    }

    return {
        bar_text: primaryCity.bar_text,
        primary_city: primaryCity,
        cities: [primaryCity],
        error: primaryCity.error,
    }
}

function parseWeatherData(raw: string): WeatherData {
    return parseJson<WeatherData>(raw, weatherFallbackData())
}

function clearBox(box: Gtk.Box) {
    let child = box.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        box.remove(child)
        child = next
    }
}

function setCompactLabel(label: Gtk.Label) {
    label.set_wrap(false)
    label.set_single_line_mode(true)
    label.set_ellipsize(Pango.EllipsizeMode.END)
}

function buildForecastCard(item: WeatherCityData["forecast"][number]) {
    const row = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true })
    row.add_css_class("forecast-row")
    row.set_size_request(0, 72)

    const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const time = new Gtk.Label({ label: item.label, xalign: 0 })
    time.add_css_class("forecast-time")
    time.set_hexpand(true)
    const temp = new Gtk.Label({ label: item.temp, xalign: 1 })
    temp.add_css_class("forecast-temp")
    header.append(time)
    header.append(temp)

    const summary = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    summary.add_css_class("forecast-summary")
    const icon = new Gtk.Label({ label: item.icon })
    icon.add_css_class("forecast-icon")
    const desc = new Gtk.Label({ label: item.desc, xalign: 0 })
    desc.add_css_class("forecast-desc")
    desc.set_hexpand(true)
    setCompactLabel(desc)
    summary.append(icon)
    summary.append(desc)

    const meta = new Gtk.Label({ label: `󰖝 ${item.wind}`, xalign: 0 })
    meta.add_css_class("forecast-meta")

    row.append(header)
    row.append(summary)
    row.append(meta)
    return row
}

function buildWeatherCityCard(city: WeatherCityData) {
    const button = new Gtk.Button({ hexpand: true })
    button.add_css_class("weather-city-card")
    if (city.is_primary) button.add_css_class("primary")
    if (city.is_auto) button.add_css_class("live")
    button.set_size_request(176, 98)
    button.connect("clicked", () => {
        void setPrimaryWeatherCity(city.id)
    })

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 })

    const top = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const title = new Gtk.Label({ label: city.title, xalign: 0 })
    title.add_css_class("weather-city-title")
    title.set_hexpand(true)
    setCompactLabel(title)
    const temp = new Gtk.Label({ label: city.temp_c, xalign: 1 })
    temp.add_css_class("weather-city-temp")
    top.append(title)
    top.append(temp)

    const middle = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const icon = new Gtk.Label({ label: city.icon, xalign: 0 })
    icon.add_css_class("weather-city-icon")
    const summary = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true })
    const condition = new Gtk.Label({ label: city.error ? "Unavailable" : city.condition, xalign: 0 })
    condition.add_css_class("weather-city-condition")
    setCompactLabel(condition)
    const meta = new Gtk.Label({ label: city.error ?? city.location, xalign: 0 })
    meta.add_css_class("weather-city-meta")
    setCompactLabel(meta)
    const updatedLabel = city.local_time || city.updated_at
    const updated = new Gtk.Label({
        label: updatedLabel && !city.error ? `Updated at ${updatedLabel}` : "",
        xalign: 0,
    })
    updated.add_css_class("weather-city-updated")
    setCompactLabel(updated)
    updated.set_visible(Boolean(updatedLabel) && !city.error)
    summary.append(condition)
    summary.append(meta)
    summary.append(updated)
    middle.append(icon)
    middle.append(summary)

    content.append(top)
    content.append(middle)

    button.set_child(content)

    const overlay = new Gtk.Overlay()
    overlay.add_css_class("weather-city-shell")
    overlay.set_size_request(176, 98)
    overlay.set_child(button)

    if (city.removable) {
        const removeLabel = moduleLabel("󰅖")
        const removeButton = moduleButton(["weather-city-remove"], removeLabel, () => {
            void removeWeatherCity(city.id)
        })
        removeButton.set_halign(Gtk.Align.END)
        removeButton.set_valign(Gtk.Align.START)
        overlay.add_overlay(removeButton)
    }

    return overlay
}

function withPrimaryWeatherCity(data: WeatherData, cityId: string): WeatherData {
    const cities = (data.cities ?? []).map((city) => ({
        ...city,
        is_primary: city.id === cityId,
    }))
    const primary = cities.find((city) => city.id === cityId) ?? cities[0] ?? data.primary_city
    return {
        ...data,
        bar_text: primary?.bar_text ?? data.bar_text,
        primary_city: primary
            ? {
                ...primary,
                is_primary: true,
            }
            : data.primary_city,
        cities,
        notice: undefined,
    }
}

function applyWeatherData(data: WeatherData) {
    lastWeatherData = data
    const current = data.primary_city ?? weatherFallbackData().primary_city
    const text = compact(data.bar_text ?? "󰖪 --")
    const secondaryCities = (data.cities ?? []).filter((city) => !city.is_primary)
    const cityCount = (data.cities?.length ?? 0)
    const tooltipLines = [
        `<b>${current.title}</b>`,
        `<tt>${text}</tt>`,
        cityCount > 1 ? `${cityCount} saved cities` : "1 saved city",
        cityCount > 1 ? "Click to open • Scroll to switch cities" : "Click to open",
    ]

    for (const refs of bars) {
        refs.weather.set_label(text)
        setTooltip(refs.weatherButton, tooltipLines.join("\n"))
    }

    for (const refs of bars) {
        const panel = refs.weatherPanel
        panel.title.set_label(current.title)
        panel.location.set_label(current.location)
        panel.currentIcon.set_label(current.icon)
        panel.currentTemp.set_label(current.temp_c)
        panel.currentCondition.set_label(current.condition)
        panel.currentMeta.set_label(`Feels like ${current.feels_like_c}   •   󰖝 ${current.wind_kmh}`)
        const cycle = [current.sunrise ? `󰖜 ${current.sunrise}` : "", current.sunset ? `󰖛 ${current.sunset}` : ""]
            .filter(Boolean)
            .join("   ")
        panel.currentCycle.set_label(cycle)
        panel.currentCycle.set_visible(Boolean(cycle))
        const updatedLabel = current.local_time || current.updated_at
        panel.updatedAt.set_label(updatedLabel ? `Updated at ${updatedLabel}` : "Updated at just now")

        const message = data.notice ?? (data.error ? data.error : "")
        panel.message.set_label(message)
        panel.message.set_visible(Boolean(message))

        clearBox(panel.cityList)
        secondaryCities.forEach((city) => {
            panel.cityList.append(buildWeatherCityCard(city))
        })
        panel.cityCards.set_visible(secondaryCities.length > 0)

        clearBox(panel.forecastBox)
        if (current.error) {
            const error = valueLabel(current.error)
            error.add_css_class("weather-meta")
            panel.forecastBox.append(error)
            continue
        }

        current.forecast.slice(0, 4).forEach((item) => {
            panel.forecastBox.append(buildForecastCard(item))
        })
    }
}

async function runWeatherAction(args: string[]) {
    const raw = await run([WEATHER_AGS_SCRIPT, ...args])
    const data = parseWeatherData(raw)
    applyWeatherData(data)
    return data
}

async function updateWeather() {
    await runWeatherAction([])
}

async function updateMemory() {
    const raw = await run([MEMORY_SCRIPT])
    const data = parseJson<{
        text?: string
        class?: string
        used_gb?: string
        used_pct?: string
        total_gb?: string
        swap_gb?: string
        swap_pct?: string
        swap_total_gb?: string
        top?: Array<{ name?: string; gb?: string }>
    }>(raw, {})
    const text = compact(data.text ?? "󰘚 0.0GB").replace(/^(\S+)\s+/, "$1  ")
    const percent = Number.parseInt((data.used_pct ?? "0%").replace("%", ""), 10) || 0
    const swapPercent = Number.parseInt((data.swap_pct ?? "0%").replace("%", ""), 10) || 0
    const percentText = `${String(percent).padStart(2, "0")}%`
    const swapPercentText = `${String(swapPercent).padStart(2, "0")}%`
    const filled = Math.max(0, Math.min(8, Math.round(percent / 12.5)))
    const swapFilled = Math.max(0, Math.min(8, Math.round(swapPercent / 12.5)))
    const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`
    const swapBar = `${"●".repeat(swapFilled)}${"·".repeat(8 - swapFilled)}`
    const memoryLine = `${(data.used_gb ?? "0.0 GB").padStart(6, " ")} / ${(data.total_gb ?? "0.0 GB").padStart(6, " ")}  (${percentText})  ${bar}`
    const swapLine = `${(data.swap_gb ?? "0.0 GB").padStart(6, " ")} / ${(data.swap_total_gb ?? "0.0 GB").padStart(6, " ")}   (${swapPercentText})  ${swapBar}`
    const rows = (data.top ?? []).map((item) => ({
        name: (item.name ?? "unknown").slice(0, 12),
        gb: item.gb ?? "0.00 GB",
    }))
    const nameWidth = Math.max(4, ...rows.map((row) => row.name.length))
    const valueWidth = Math.max(7, ...rows.map((row) => row.gb.length))
    const topPrograms = rows
        .map((row) => `${row.name.padEnd(nameWidth, " ")}  ${row.gb.padStart(valueWidth, " ")}`)
        .join("\n")
    const tooltip = [
        "<b>Memory</b>",
        `<tt>${memoryLine}</tt>`,
        "",
        "<b>Swap</b>",
        `<tt>${swapLine}</tt>`,
        "",
        "<b>Top Apps</b>",
        topPrograms ? `<tt>${topPrograms}</tt>` : `<span alpha="70%">No active process data</span>`,
    ].join("\n")
    for (const refs of bars) {
        refs.memory.set_label(text)
        refs.memoryButton.remove_css_class("warning")
        refs.memoryButton.remove_css_class("critical")
        if (data.class) refs.memoryButton.add_css_class(data.class)
        setTooltip(refs.memoryButton, tooltip)
    }
}

async function updateCpu() {
    const raw = await run([CPU_SCRIPT])
    const data = parseJson<{
        text?: string
        class?: string
        usage?: string
        load1?: string
        load5?: string
        load15?: string
        cores?: string
    }>(raw, {})
    const text = compact(data.text ?? "󰍛  0%").replace(/^(\S+)\s+/, "$1  ")
    const percent = Number.parseInt((data.usage ?? "0%").replace("%", ""), 10) || 0
    const filled = Math.max(0, Math.min(8, Math.round(percent / 12.5)))
    const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`
    const tooltip = [
        "<b>CPU</b>",
        `<tt>${(data.usage ?? "0%").padEnd(4, " ")}  ${bar}  •  ${data.cores ?? "0"} cores</tt>`,
        "",
        "<b>Avg Load</b>",
        `<tt>01 min   ${(data.load1 ?? "0.00").padStart(5, " ")}</tt>`,
        `<tt>05 min   ${(data.load5 ?? "0.00").padStart(5, " ")}</tt>`,
        `<tt>15 min   ${(data.load15 ?? "0.00").padStart(5, " ")}</tt>`,
    ].join("\n")
    for (const refs of bars) {
        refs.cpu.set_label(text)
        refs.cpuButton.remove_css_class("warning")
        refs.cpuButton.remove_css_class("critical")
        if (data.class === "critical") refs.cpuButton.add_css_class("critical")
        else if (data.class === "warning") refs.cpuButton.add_css_class("warning")
        setTooltip(refs.cpuButton, tooltip)
    }
}

async function updateIndicators() {
    const [idleRaw, notifRaw, voxtypeRaw, updateRaw] = await Promise.all([
        run([IDLE_SCRIPT]),
        run([NOTIF_SCRIPT]),
        run(["omarchy-voxtype-status"]),
        run(["omarchy-update-available"]),
    ])

    const idle = parseJson<{ text?: string; tooltip?: string }>(idleRaw, {})
    const notif = parseJson<{ text?: string; tooltip?: string }>(notifRaw, {})
    const voxtype = parseJson<{ alt?: string; tooltip?: string }>(voxtypeRaw, {})
    const voxtypeIcon = voxtype.alt === "recording" ? "󰍬" : voxtype.alt === "transcribing" ? "󰔟" : ""

    for (const refs of bars) {
        refs.idle.set_label(idle.text ?? "")
        refs.idleButton.set_visible(Boolean(idle.text))
        refs.notif.set_label(notif.text ?? "")
        refs.notifButton.set_visible(Boolean(notif.text))
        refs.voxtype.set_label(voxtypeIcon)
        refs.voxtypeButton.set_visible(Boolean(voxtypeIcon))
        refs.update.set_label(updateRaw ? "" : "")
        refs.updateButton.set_visible(Boolean(updateRaw))

        setTooltip(refs.idleButton, idle.tooltip ?? "")
        setTooltip(refs.notifButton, notif.tooltip ?? "")
        setTooltip(refs.voxtypeButton, voxtype.tooltip ?? "")
        setTooltip(refs.updateButton, updateRaw ? "<b>System Update</b>\n<tt>Status  Updates available</tt>" : "")
    }
}

async function updatePrivacy() {
    const [privacy, recordRaw] = await Promise.all([
        getPrivacyInfo(),
        run([SCREENREC_SCRIPT]),
    ])
    const record = parseJson<{ text?: string; tooltip?: string; class?: string }>(recordRaw, {})

    for (const refs of bars) {
        refs.privacy.set_label(privacy.text)
        refs.privacyButton.set_visible(Boolean(privacy.text))
        refs.privacyButton.remove_css_class("critical")
        if (privacy.micActive || privacy.screenActive) refs.privacyButton.add_css_class("critical")
        setTooltip(refs.privacyButton, privacy.tooltip)

        refs.record.set_label(record.text ?? "")
        refs.recordButton.set_visible(Boolean(record.text))
        refs.recordButton.remove_css_class("critical")
        if (record.class === "active") refs.recordButton.add_css_class("critical")
        setTooltip(refs.recordButton, record.tooltip ?? "")
    }
}

async function updateAudio() {
    const info = await getAudioInfo()
    for (const refs of bars) {
        refs.audio.set_label(info.text)
        setTooltip(refs.audioButton, info.tooltip)
    }
}

async function updateBrightness() {
    const info = await getBrightnessInfo()
    const filled = Math.max(0, Math.min(8, Math.round(info.value / 12.5)))
    const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`
    for (const refs of bars) {
        refs.brightness.set_label(info.text)
        setTooltip(
            refs.brightnessButton,
            [
                "<b>Brightness</b>",
                `<tt>${String(info.value).padStart(2, "0")}%  ${bar}${info.nightLight ? "  " : ""}</tt>`,
            ].join("\n"),
        )
    }
}

async function updateBattery() {
    const info = getBatteryInfo()
    for (const refs of bars) {
        refs.battery.set_label(info.text)
        refs.batteryButton.remove_css_class("charging")
        refs.batteryButton.remove_css_class("warning")
        refs.batteryButton.remove_css_class("critical")
        if (info.status === "Charging") refs.batteryButton.add_css_class("charging")
        if (info.levelClass) refs.batteryButton.add_css_class(info.levelClass)
        setTooltip(refs.batteryButton, info.tooltip)
    }
}

async function updateNetwork() {
    const [network, bluetooth] = await Promise.all([getNetworkInfo(), getBluetoothInfo()])
    for (const refs of bars) {
        refs.network.set_label(network.label)
        refs.bluetooth.set_label(bluetooth.label)
        refs.bluetoothButton.remove_css_class("connected")
        if (bluetooth.connected) refs.bluetoothButton.add_css_class("connected")
        setTooltip(refs.networkButton, network.tooltip)
        setTooltip(refs.bluetoothButton, bluetooth.tooltip)
    }
}

function refreshClocks() {
    for (const refs of bars) {
        refs.clock.set_label(localClockText())
        refs.indiaClock.set_label(indiaClockText())
    }
}

async function refreshWeatherNow() {
    const data = await runWeatherAction(["--refresh"])
    if (data) {
        const body = data.error ? data.error : `${data.primary_city.title}   •   ${data.bar_text}`
        await run(["/usr/bin/notify-send", "Weather Updated", body, "-a", "AGS Weather"])
    }
}

async function syncWeatherPrimarySelection() {
    if (weatherPrimarySyncInFlight) return
    weatherPrimarySyncInFlight = true

    try {
        while (pendingWeatherPrimaryId) {
            const targetId = pendingWeatherPrimaryId
            pendingWeatherPrimaryId = null
            await runWeatherAction(["--set-primary", targetId])
        }
    } finally {
        weatherPrimarySyncInFlight = false
        if (pendingWeatherPrimaryId) void syncWeatherPrimarySelection()
    }
}

function queueWeatherPrimarySelection(cityId: string) {
    pendingWeatherPrimaryId = cityId
    void syncWeatherPrimarySelection()
}

async function setPrimaryWeatherCity(cityId: string) {
    if (lastWeatherData) applyWeatherData(withPrimaryWeatherCity(lastWeatherData, cityId))
    queueWeatherPrimarySelection(cityId)
}

async function removeWeatherCity(cityId: string) {
    await runWeatherAction(["--remove-city", cityId])
}

async function cycleWeather(direction: "next" | "prev") {
    const cities = lastWeatherData?.cities ?? []
    if (cities.length <= 1) {
        await runWeatherAction(["--cycle", direction])
        return
    }

    const currentId = lastWeatherData?.primary_city?.id ?? cities[0]?.id
    const currentIndex = Math.max(0, cities.findIndex((city) => city.id === currentId))
    const offset = direction === "prev" ? -1 : 1
    const nextCity = cities[(currentIndex + offset + cities.length) % cities.length]
    if (!nextCity) return

    applyWeatherData(withPrimaryWeatherCity(lastWeatherData!, nextCity.id))
    queueWeatherPrimarySelection(nextCity.id)
}

async function addWeatherCity(panel: WeatherPanelRefs) {
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
    const data = await runWeatherAction(["--add-city", query])
    const notice = (data.notice ?? "").toLowerCase()
    if (notice.startsWith("added")) {
        panel.addEntry.set_text("")
        panel.addRevealer.set_reveal_child(false)
        panel.addTriggerLabel.set_label("󰐕")
        panel.addTrigger.set_visible(false)
        scheduleWeatherPanelRelayout(panel)
    }
}

function closeWeatherWindow(panel: WeatherPanelRefs) {
    panel.addEntry.set_text("")
    panel.addRevealer.set_reveal_child(false)
    panel.addTriggerLabel.set_label("󰐕")
    panel.addTrigger.set_visible(false)
    panel.window.set_visible(false)
    panel.window.set_keymode(Astal.Keymode.NONE)
}

function positionWeatherWindow(
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    let buttonX = 16
    let buttonY = 0

    try {
        const [ok, x, y] = anchorButton.translate_coordinates(shell, 0, 0)
        if (ok) {
            buttonX = Math.round(x)
            buttonY = Math.round(y)
        }
    } catch {}

    const shellWidth = shell.get_width() > 0 ? shell.get_width() : monitorWidth
    const width = Math.min(panelWidth, Math.max(280, shellWidth - 16))
    const buttonCenter = buttonX + Math.round(anchorButton.get_width() / 2)
    const maxLeft = Math.max(8, shellWidth - width - 8)
    const left = Math.max(8, Math.min(maxLeft, Math.round(buttonCenter - width / 2)))
    const top = Math.max(40, Math.round(buttonY + anchorButton.get_height() + 10))
    panel.window.set_default_size(width, 1)
    panel.card.set_size_request(width, -1)
    setWindowMargins(panel.window as Astal.Window, top, 0, left)
}

function scheduleWeatherPanelRelayout(panel: WeatherPanelRefs) {
    if (!panel.window.is_visible()) return
    const anchorButton = panel.anchorButton
    const shell = panel.shell
    const monitorWidth = panel.monitorWidth
    const panelWidth = panel.panelWidth
    if (!anchorButton || !shell || !monitorWidth || !panelWidth) return

    ;[0, 120, 240].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            if (!panel.window.is_visible()) return GLib.SOURCE_REMOVE
            panel.window.set_default_size(panelWidth, 1)
            panel.card.queue_resize()
            panel.window.queue_resize()
            positionWeatherWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
            return GLib.SOURCE_REMOVE
        })
    })
}

function openWeatherWindow(
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    bars.forEach((refs) => {
        if (refs.weatherPanel !== panel && refs.weatherPanel.window.is_visible()) {
            closeWeatherWindow(refs.weatherPanel)
        }
    })

    positionWeatherWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
    panel.window.set_visible(true)
    panel.window.present()
    panel.window.set_keymode(Astal.Keymode.ON_DEMAND)
    if (panel.addRevealer.get_reveal_child()) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            panel.addEntry.grab_focus_without_selecting()
            return GLib.SOURCE_REMOVE
        })
    }
}

function toggleWeatherWindow(
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    if (panel.window.is_visible()) {
        closeWeatherWindow(panel)
        return
    }

    openWeatherWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
}

function buildWeatherPanel(monitor: number, compactLayout: boolean, panelWidth: number): WeatherPanelRefs {
    const title = valueLabel("Weather")
    title.add_css_class("weather-kicker")

    const location = valueLabel("Current Location")
    location.add_css_class("weather-location")

    const headerText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 })
    headerText.append(title)
    headerText.append(location)

    const refreshIcon = moduleLabel("󰑐")
    const refreshButton = moduleButton(["weather-refresh"], refreshIcon, () => {
        void refreshWeatherNow()
    })
    const closeIcon = moduleLabel("󰅖")
    const closeButton = moduleButton(["weather-refresh", "weather-close"], closeIcon)

    const headerActions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    headerActions.append(refreshButton)
    headerActions.append(closeButton)

    const header = new Gtk.CenterBox()
    header.add_css_class("weather-header")
    header.set_start_widget(headerText)
    header.set_end_widget(headerActions)

    const addEntry = new Gtk.Entry({ hexpand: true, placeholder_text: "Add a city" })
    addEntry.add_css_class("weather-entry")
    addEntry.set_focusable(true)
    addEntry.set_can_focus(true)
    const addIcon = moduleLabel("󰐕")
    const addButton = moduleButton(["weather-add"], addIcon)

    const addRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    addRow.add_css_class("weather-add-row")
    addRow.append(addEntry)
    addRow.append(addButton)

    const addRevealer = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
        reveal_child: false,
        child: addRow,
    })
    addRevealer.add_css_class("weather-add-revealer")

    const message = valueLabel("")
    message.add_css_class("weather-message")
    message.set_visible(false)

    const currentIcon = new Gtk.Label({ label: "☁️" })
    currentIcon.add_css_class("weather-hero-icon")
    const currentTemp = valueLabel("--")
    currentTemp.add_css_class("weather-temp")
    setCompactLabel(currentTemp)
    const currentCondition = valueLabel("Loading…")
    currentCondition.add_css_class("weather-condition")
    setCompactLabel(currentCondition)
    const currentMeta = valueLabel("")
    currentMeta.add_css_class("weather-meta")
    setCompactLabel(currentMeta)
    const currentCycle = valueLabel("")
    currentCycle.add_css_class("weather-cycle")
    setCompactLabel(currentCycle)
    const updatedAt = valueLabel("")
    updatedAt.add_css_class("weather-updated")
    setCompactLabel(updatedAt)

    const currentHeadline = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    currentHeadline.append(currentTemp)
    currentHeadline.append(currentCondition)

    const currentText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true })
    currentText.append(currentHeadline)
    currentText.append(currentMeta)
    currentText.append(currentCycle)
    currentText.append(updatedAt)

    const current = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    current.add_css_class("weather-current")
    current.append(currentIcon)
    current.append(currentText)

    const cityHeader = valueLabel("Elsewhere")
    cityHeader.add_css_class("weather-forecast-header")
    const addTriggerLabel = moduleLabel("󰐕")
    const addTrigger = moduleButton(["weather-add-trigger"], addTriggerLabel)
    addTrigger.set_visible(false)
    const cityHeaderBar = new Gtk.CenterBox()
    cityHeaderBar.add_css_class("weather-section-bar")
    cityHeaderBar.set_start_widget(cityHeader)
    cityHeaderBar.set_end_widget(addTrigger)

    const cityList = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    cityList.add_css_class("weather-city-list")

    const cityScroller = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.NEVER,
        propagate_natural_width: false,
    })
    cityScroller.add_css_class("weather-city-scroller")
    cityScroller.set_min_content_height(102)
    cityScroller.set_max_content_height(116)
    cityScroller.set_min_content_width(panelWidth - 24)
    cityScroller.set_max_content_width(panelWidth - 24)
    cityScroller.set_hexpand(true)
    cityScroller.set_child(cityList)

    const cityCards = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    cityCards.set_visible(false)
    cityCards.append(cityScroller)

    const cityWrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    cityWrap.add_css_class("weather-city-section")
    cityWrap.append(cityHeaderBar)
    cityWrap.append(addRevealer)
    cityWrap.append(message)
    cityWrap.append(cityCards)

    const forecastHeader = valueLabel("Ahead")
    forecastHeader.add_css_class("weather-forecast-header")
    const forecastBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    forecastBox.set_homogeneous(true)

    const forecastWrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    forecastWrap.add_css_class("weather-forecast")
    forecastWrap.append(forecastHeader)
    forecastWrap.append(forecastBox)

    const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    card.add_css_class("weather-panel")
    card.set_size_request(panelWidth, -1)
    card.append(header)
    card.append(current)
    card.append(cityWrap)
    card.append(forecastWrap)

    const window = new Astal.Window({
        application: App,
        name: `weather-${monitor}`,
        monitor,
        anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT,
        exclusivity: Astal.Exclusivity.IGNORE,
        keymode: Astal.Keymode.NONE,
        layer: Astal.Layer.OVERLAY,
        visible: false,
        child: card,
    })
    setWindowMargins(window, compactLayout ? 52 : 56, 0, 16)

    const escapeController = new Gtk.EventControllerKey()
    escapeController.connect("key-pressed", (_controller, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
            closeWeatherWindow(panel)
            return true
        }
        return false
    })
    window.add_controller(escapeController)
    window.connect("close-request", () => {
        closeWeatherWindow(panel)
        return true
    })
    App.add_window(window)

    const panel: WeatherPanelRefs = {
        window,
        card,
        citySection: cityWrap,
        cityCards,
        title,
        location,
        addEntry,
        addRevealer,
        addTrigger,
        addTriggerLabel,
        message,
        currentIcon,
        currentTemp,
        currentCondition,
        currentMeta,
        currentCycle,
        updatedAt,
        cityList,
        forecastBox,
    }

    let addHeaderHovered = false
    const syncAddTrigger = () => {
        const expanded = addRevealer.get_reveal_child()
        addTriggerLabel.set_label(expanded ? "󰅖" : "󰐕")
        addTrigger.set_visible(addHeaderHovered || expanded)
    }

    addButton.connect("clicked", () => {
        void addWeatherCity(panel)
    })
    addTrigger.connect("clicked", () => {
        const expanded = !addRevealer.get_reveal_child()
        addRevealer.set_reveal_child(expanded)
        if (!expanded) addEntry.set_text("")
        syncAddTrigger()
        scheduleWeatherPanelRelayout(panel)
        if (expanded) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                addEntry.grab_focus_without_selecting()
                return GLib.SOURCE_REMOVE
            })
        }
    })
    closeButton.connect("clicked", () => {
        closeWeatherWindow(panel)
    })
    addEntry.connect("activate", () => {
        void addWeatherCity(panel)
    })
    const cityHeaderMotion = new Gtk.EventControllerMotion()
    cityHeaderMotion.connect("enter", () => {
        addHeaderHovered = true
        syncAddTrigger()
    })
    cityHeaderMotion.connect("leave", () => {
        addHeaderHovered = false
        syncAddTrigger()
    })
    cityHeaderBar.add_controller(cityHeaderMotion)
    addRevealer.connect("notify::child-revealed", () => {
        scheduleWeatherPanelRelayout(panel)
    })
    syncAddTrigger()

    return panel
}

function buildBar(monitor: number): Astal.Window {
    const monitorInfo = App.get_monitors()[monitor]
    const geometry = monitorInfo?.get_geometry()
    const monitorWidth = geometry?.width ?? 1920
    const monitorHeight = geometry?.height ?? 1080
    const compactLayout = monitorWidth < 1500 || monitorHeight > monitorWidth
    const weatherPanelWidth = compactLayout ? Math.min(360, monitorWidth - 20) : 392

    const omarchyLabel = moduleLabel("<span font='omarchy'></span>")
    omarchyLabel.set_use_markup(true)
    const omarchyButton = moduleButton(["logo-button"], omarchyLabel, () => spawn(["omarchy-menu"]))
    addRightClick(omarchyButton, () => spawn(["xdg-terminal-exec"]))
    setTooltip(omarchyButton, "")

    const workspaceBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 2 })
    workspaceBox.add_css_class("workspaces")

    const leftCapsule = capsule(["left-capsule"])
    leftCapsule.set_spacing(compactLayout ? 2 : 3)
    leftCapsule.append(omarchyButton)
    leftCapsule.append(workspaceBox)

    const weather = moduleLabel("󰖪 --")
    const weatherButton = moduleButton(["weather"], weather)
    const weatherPanel = buildWeatherPanel(monitor, compactLayout, weatherPanelWidth)
    weatherButton.connect("clicked", () => {
        toggleWeatherWindow(weatherPanel, weatherButton, shell, monitorWidth, weatherPanelWidth)
    })
    addScroll(
        weatherButton,
        () => {
            void cycleWeather("next")
        },
        () => {
            void cycleWeather("prev")
        },
    )
    addRightClick(weatherButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "nvim", `${HOME}/.config/ags/scripts/weather-ags.sh`]))

    const clock = moduleLabel(localClockText())
    const clockButton = moduleButton(["clock"], clock)
    addRightClick(clockButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "omarchy-tz-select"]))
    setTooltip(clockButton, `<b>Local Time</b>\n<tt>${GLib.DateTime.new_now_local()?.format("%a, %d %b  %H:%M") ?? ""}</tt>`)

    const indiaClock = moduleLabel(indiaClockText())
    const indiaButton = moduleButton(["clock", "india"], indiaClock)
    setTooltip(indiaButton, "")

    const privacy = moduleLabel("")
    const privacyButton = moduleButton(["status-indicator", "privacy"], privacy, () => spawn(["omarchy-launch-audio"]))
    privacyButton.set_visible(false)

    const update = moduleLabel("")
    const updateButton = moduleButton(["status-indicator"], update, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "omarchy-update"]))

    const voxtype = moduleLabel("")
    const voxtypeButton = moduleButton(["status-indicator"], voxtype, () => spawn(["omarchy-voxtype-model"]))
    addRightClick(voxtypeButton, () => spawn(["omarchy-voxtype-config"]))

    const record = moduleLabel("")
    const recordButton = moduleButton(["status-indicator"], record, () => {
        spawn(["omarchy-cmd-screenrecord"])
        schedulePrivacyRefresh()
    })

    const idle = moduleLabel("")
    const idleButton = moduleButton(["status-indicator"], idle, () => spawn(["omarchy-toggle-idle"]))

    const notif = moduleLabel("")
    const notifButton = moduleButton(["status-indicator"], notif, () => spawn(["omarchy-toggle-notification-silencing"]))

    const centerCapsule = capsule(["center-capsule"])
    centerCapsule.set_spacing(compactLayout ? 3 : 4)
        ;[weatherButton, clockButton, indiaButton, privacyButton, updateButton, voxtypeButton, recordButton, idleButton, notifButton].forEach((widget) => centerCapsule.append(widget))

    const bluetooth = moduleLabel("")
    const bluetoothButton = moduleButton(["compact"], bluetooth, () => spawn(["omarchy-launch-bluetooth"]))

    const network = moduleLabel("󰤮")
    const networkButton = moduleButton(["compact"], network, () => spawn(["omarchy-launch-wifi"]))

    const audio = moduleLabel("󰕿")
    const audioButton = moduleButton(["compact"], audio, () => spawn(["omarchy-launch-audio"]))
    addRightClick(audioButton, () => {
        spawn(["pamixer", "-t"])
        scheduleAudioRefresh()
    })
    addScroll(
        audioButton,
        () => {
            spawn(["pamixer", "--increase", "2"])
            scheduleAudioRefresh()
        },
        () => {
            spawn(["pamixer", "--decrease", "2"])
            scheduleAudioRefresh()
        },
    )

    const brightness = moduleLabel("󰃟 0%")
    const brightnessButton = moduleButton(["compact", "brightness"], brightness, () => {
        spawn(["omarchy-toggle-nightlight"])
        scheduleBrightnessRefresh()
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1100, () => {
            void updateBrightness()
            return GLib.SOURCE_REMOVE
        })
    })
    addScroll(
        brightnessButton,
        () => {
            spawn(["omarchy-brightness-display", "+5%"])
            scheduleBrightnessRefresh()
        },
        () => {
            spawn(["omarchy-brightness-display", "5%-"])
            scheduleBrightnessRefresh()
        },
    )

    const cpu = moduleLabel("󰍛 0%")
    const cpuButton = moduleButton(["metric"], cpu, () => spawn(["omarchy-launch-or-focus-tui", "btop"]))
    addRightClick(cpuButton, () => spawn(["alacritty"]))

    const memory = moduleLabel("󰘚 0.0GB")
    const memoryButton = moduleButton(["metric"], memory, () => spawn(["omarchy-launch-or-focus-tui", "btop"]))

    const battery = moduleLabel("󰁹 0%")
    const batteryButton = moduleButton(["battery"], battery, () => spawn(["omarchy-menu", "power"]))
    addRightClick(batteryButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "battery-zen", "tui"]))

    const rightCapsule = capsule(["right-capsule"])
    rightCapsule.set_spacing(compactLayout ? 4 : 6)
        ;[bluetoothButton, networkButton, audioButton, brightnessButton, cpuButton, memoryButton, batteryButton].forEach((widget) => rightCapsule.append(widget))

    let root: Gtk.Widget
    if (compactLayout) {
        const compactRoot = new Gtk.CenterBox({ hexpand: true })
        compactRoot.add_css_class("bar-root")
        compactRoot.set_start_widget(leftCapsule)
        compactRoot.set_center_widget(centerCapsule)
        compactRoot.set_end_widget(rightCapsule)
        root = compactRoot
    } else {
        const leftWrap = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
        leftWrap.set_halign(Gtk.Align.START)
        leftWrap.append(leftCapsule)

        const rightWrap = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
        rightWrap.set_halign(Gtk.Align.END)
        rightWrap.append(rightCapsule)

        const track = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
        track.add_css_class("bar-root")
        track.append(leftWrap)
        track.append(rightWrap)

        centerCapsule.set_halign(Gtk.Align.CENTER)
        centerCapsule.set_valign(Gtk.Align.CENTER)

        const overlayRoot = new Gtk.Overlay({ hexpand: true })
        overlayRoot.set_child(track)
        overlayRoot.add_overlay(centerCapsule)
        root = overlayRoot
    }

    const shell = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
    shell.add_css_class("bar-shell")
    if (compactLayout) shell.add_css_class("compact-monitor")
    shell.append(root)
    weatherPanel.anchorButton = weatherButton
    weatherPanel.shell = shell
    weatherPanel.monitorWidth = monitorWidth
    weatherPanel.panelWidth = weatherPanelWidth

    const refs: BarRefs = {
        workspaceBox,
        weather,
        weatherButton,
        weatherPanel,
        clock,
        indiaClock,
        privacy,
        privacyButton,
        update,
        updateButton,
        voxtype,
        voxtypeButton,
        record,
        recordButton,
        idle,
        idleButton,
        notif,
        notifButton,
        bluetooth,
        bluetoothButton,
        network,
        networkButton,
        audio,
        audioButton,
        brightness,
        brightnessButton,
        cpu,
        cpuButton,
        memory,
        memoryButton,
        battery,
        batteryButton,
    }
    bars.push(refs)

    const window = new Astal.Window({
        application: App,
        name: `bar-${monitor}`,
        monitor,
        anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT,
        exclusivity: Astal.Exclusivity.EXCLUSIVE,
        keymode: Astal.Keymode.NONE,
        layer: Astal.Layer.TOP,
        visible: true,
        child: shell,
    })
    setWindowMargins(window, 2, 0, 0)
    return window
}

App.start({
    instanceName: "simple-bar",
    main() {
        applyDynamicCss()
        watchStyle()

        const monitors = App.get_monitors()
        const count = Math.max(monitors.length, 1)

        for (let index = 0; index < count; index += 1) {
            App.add_window(buildBar(index))
        }

        poll(1, refreshClocks)
        poll(3, updateNetwork)
        poll(5, updateCpu)
        poll(5, updateMemory)
        poll(5, updateBattery)
        poll(5, updateBrightness)
        poll(1, updatePrivacy)
        poll(8, updateIndicators)
        poll(60, updateWeather)
        poll(30, updateAudio)
        void connectBrightnessWatch()
        connectAudioEvents()
        void updateWorkspaces()
        connectHyprlandEvents()
    },
})
