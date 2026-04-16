import { Astal, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { compact, parseJson, poll, run, spawn } from "./lib/helpers"
import { CPU_SCRIPT, HOME, IDLE_SCRIPT, MEMORY_SCRIPT, NOTIF_SCRIPT, SCREENREC_SCRIPT, WEATHER_AGS_SCRIPT } from "./lib/paths"
import { getAudioInfo, getBatteryInfo, getBluetoothInfo, getBrightnessInfo, getBrightnessWatchPaths, getNetworkInfo, getPrivacyInfo, indiaClockText, localClockText } from "./lib/system"
import { applyDynamicCss, watchStyle } from "./lib/theme"
import type { BarRefs, WeatherData, WeatherPanelRefs } from "./lib/types"
import { addRightClick, addScroll, capsule, moduleButton, moduleLabel, setTooltip, setWindowMargins, valueLabel, workspaceButton } from "./lib/widgets"

const bars: BarRefs[] = []
let hyprSocketStream: Gio.DataInputStream | null = null
const brightnessMonitors: Gio.FileMonitor[] = []
let monitorRefreshTimer = 0
let audioSubscribeProcess: Gio.Subprocess | null = null
let audioSubscribeStream: Gio.DataInputStream | null = null
let audioRefreshTimer = 0

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

async function updateWeather() {
    const raw = await run([WEATHER_AGS_SCRIPT])
    const data = parseJson<WeatherData>(
        raw,
        {
            bar_text: "󰖪 --",
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
        },
    )
    const text = compact(data.bar_text ?? "󰖪 --")
    for (const refs of bars) {
        refs.weather.set_label(text)
        setTooltip(refs.weatherButton, "<b>Weather</b>\nClick to open forecast")
    }
    for (const refs of bars) {
        const panel = refs.weatherPanel
        panel.location.set_label(data.location)
        panel.currentIcon.set_label(data.icon)
        panel.currentTemp.set_label(data.temp_c)
        panel.currentCondition.set_label(data.condition)
        panel.currentMeta.set_label(`Feels like ${data.feels_like_c}   •   󰖝 ${data.wind_kmh}`)
        const cycle = [data.sunrise ? `󰖜 ${data.sunrise}` : "", data.sunset ? `󰖛 ${data.sunset}` : ""]
            .filter(Boolean)
            .join("   ")
        panel.currentCycle.set_label(cycle)
        panel.currentCycle.set_visible(Boolean(cycle))
        panel.updatedAt.set_label(`Updated ${data.updated_at}`)

        let child = panel.forecastBox.get_first_child()
        while (child) {
            const next = child.get_next_sibling()
            panel.forecastBox.remove(child)
            child = next
        }

        if (data.error) {
            const error = valueLabel(data.error)
            error.add_css_class("weather-meta")
            panel.forecastBox.append(error)
            continue
        }

        data.forecast.slice(0, 3).forEach((item) => {
            const row = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true })
            row.add_css_class("forecast-row")

            const time = new Gtk.Label({ label: item.label, xalign: 0.5 })
            time.add_css_class("forecast-time")
            const icon = new Gtk.Label({ label: item.icon })
            icon.add_css_class("forecast-icon")
            const desc = new Gtk.Label({ label: item.desc, xalign: 0.5, wrap: true, justify: Gtk.Justification.CENTER })
            desc.add_css_class("forecast-desc")
            const meta = new Gtk.Label({ label: `${item.temp}   •   󰖝 ${item.wind}`, xalign: 0.5, justify: Gtk.Justification.CENTER })
            meta.add_css_class("forecast-meta")
            row.append(time)
            row.append(icon)
            row.append(desc)
            row.append(meta)
            panel.forecastBox.append(row)
        })
    }
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
    const raw = await run([WEATHER_AGS_SCRIPT, "--refresh"])
    const data = parseJson<WeatherData | null>(raw, null)
    if (data) {
        const body = data.error ? data.error : `${data.location}   •   ${data.bar_text}`
        await run(["/usr/bin/notify-send", "Weather Updated", body, "-a", "AGS Weather"])
        await updateWeather()
    }
}

function toggleWeatherPopover(panel: WeatherPanelRefs) {
    if (panel.popover.is_visible()) {
        panel.revealer.set_reveal_child(false)
        return
    }

    panel.revealer.set_reveal_child(false)
    panel.popover.popup()
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        panel.revealer.set_reveal_child(true)
        return GLib.SOURCE_REMOVE
    })
}

function buildWeatherPanel(anchor: Gtk.Widget): WeatherPanelRefs {
    const location = valueLabel("Current Location")
    location.add_css_class("weather-location")

    const refreshIcon = moduleLabel("󰑐")
    const refreshButton = moduleButton(["weather-refresh"], refreshIcon, () => {
        void refreshWeatherNow()
    })

    const header = new Gtk.CenterBox()
    header.add_css_class("weather-header")
    header.set_start_widget(location)
    header.set_end_widget(refreshButton)

    const currentIcon = new Gtk.Label({ label: "☁️" })
    currentIcon.add_css_class("weather-hero-icon")
    const currentTemp = valueLabel("--")
    currentTemp.add_css_class("weather-temp")
    const currentCondition = valueLabel("Loading…")
    currentCondition.add_css_class("weather-condition")
    const currentMeta = valueLabel("")
    currentMeta.add_css_class("weather-meta")
    const currentCycle = valueLabel("")
    currentCycle.add_css_class("weather-cycle")
    const updatedAt = valueLabel("")
    updatedAt.add_css_class("weather-updated")

    const currentText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true })
    currentText.append(currentTemp)
    currentText.append(currentCondition)
    currentText.append(currentMeta)
    currentText.append(currentCycle)
    currentText.append(updatedAt)

    const current = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 14 })
    current.add_css_class("weather-current")
    current.append(currentIcon)
    current.append(currentText)

    const forecastHeader = valueLabel("Next Up")
    forecastHeader.add_css_class("weather-forecast-header")
    const forecastBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    forecastBox.set_homogeneous(true)

    const forecastWrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
    forecastWrap.add_css_class("weather-forecast")
    forecastWrap.append(forecastHeader)
    forecastWrap.append(forecastBox)

    const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    card.add_css_class("weather-panel")
    card.append(header)
    card.append(current)
    card.append(forecastWrap)

    const revealer = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
        transition_duration: 300,
        reveal_child: false,
    })
    revealer.add_css_class("weather-revealer")
    revealer.set_child(card)

    const popover = new Gtk.Popover({
        autohide: true,
        has_arrow: false,
        position: Gtk.PositionType.BOTTOM,
    })
    popover.add_css_class("weather-shell")
    popover.set_child(revealer)
    popover.set_parent(anchor)
    revealer.connect("notify::child-revealed", () => {
        if (!revealer.get_child_revealed() && !revealer.get_reveal_child() && popover.is_visible()) {
            popover.popdown()
        }
    })
    popover.connect("closed", () => {
        revealer.set_reveal_child(false)
    })

    return {
        popover,
        revealer,
        card,
        location,
        currentIcon,
        currentTemp,
        currentCondition,
        currentMeta,
        currentCycle,
        updatedAt,
        forecastBox,
    }
}

function buildBar(monitor: number): Astal.Window {
    const monitorInfo = App.get_monitors()[monitor]
    const geometry = monitorInfo?.get_geometry()
    const monitorWidth = geometry?.width ?? 1920
    const monitorHeight = geometry?.height ?? 1080
    const compactLayout = monitorWidth < 1500 || monitorHeight > monitorWidth

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
    const weatherPanel = buildWeatherPanel(weatherButton)
    weatherButton.connect("clicked", () => toggleWeatherPopover(weatherPanel))
    addRightClick(weatherButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "nvim", `${HOME}/.config/waybar/scripts/weather.sh`]))

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
