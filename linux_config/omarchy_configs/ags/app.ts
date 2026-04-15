import { Astal, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { compact, parseJson, poll, run, spawn } from "./lib/helpers"
import { HOME, IDLE_SCRIPT, MEMORY_SCRIPT, NOTIF_SCRIPT, SCREENREC_SCRIPT, WEATHER_AGS_SCRIPT, WEATHER_SCRIPT } from "./lib/paths"
import { getAudioInfo, getBatteryInfo, getBluetoothInfo, getBrightnessInfo, getCpuUsage, getNetworkInfo, getPrivacyInfo, indiaClockText, localClockText } from "./lib/system"
import { applyDynamicCss, watchStyle } from "./lib/theme"
import type { BarRefs, ControlCenterRefs, WeatherData, WeatherPanelRefs } from "./lib/types"
import { addRightClick, addScroll, capsule, controlTile, moduleButton, moduleLabel, setTooltip, setWindowMargins, togglePopover, valueLabel, workspaceButton } from "./lib/widgets"

const bars: BarRefs[] = []
let controlCenter: ControlCenterRefs | null = null
let brightnessTimer = 0
let volumeTimer = 0
let syncingBrightness = false
let syncingVolume = false
let hyprSocketStream: Gio.DataInputStream | null = null

function schedulePrivacyRefresh() {
    ;[80, 220, 500, 900].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            void updatePrivacy()
            return GLib.SOURCE_REMOVE
        })
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
            forecast: [],
        },
    )
    const text = compact(data.bar_text ?? "󰖪 --")
    for (const refs of bars) {
        refs.weather.set_label(text)
        setTooltip(refs.weatherButton, "<b>Weather</b>\nClick to open forecast")
    }
    if (controlCenter) controlCenter.centerWeather.set_label(text)
    for (const refs of bars) {
        const panel = refs.weatherPanel
        panel.location.set_label(data.location)
        panel.currentIcon.set_label(data.icon)
        panel.currentTemp.set_label(data.temp_c)
        panel.currentCondition.set_label(data.condition)
        panel.currentMeta.set_label(`Feels like ${data.feels_like_c}   •   󰖝 ${data.wind_kmh}`)
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
    const data = parseJson<{ text?: string; tooltip?: string; class?: string }>(raw, {})
    const text = compact(data.text ?? "󰘚 0.0GB").replace(/^(\S+)\s+/, "$1  ")
    for (const refs of bars) {
        refs.memory.set_label(text)
        refs.memoryButton.remove_css_class("warning")
        refs.memoryButton.remove_css_class("critical")
        if (data.class) refs.memoryButton.add_css_class(data.class)
        setTooltip(refs.memoryButton, data.tooltip ?? "")
    }
}

async function updateCpu() {
    const usage = getCpuUsage()
    for (const refs of bars) {
        refs.cpu.set_label(`󰍛  ${usage}%`)
        refs.cpuButton.remove_css_class("warning")
        refs.cpuButton.remove_css_class("critical")
        if (usage >= 85) refs.cpuButton.add_css_class("critical")
        else if (usage >= 65) refs.cpuButton.add_css_class("warning")
        setTooltip(refs.cpuButton, `<b>CPU</b>\nUsage: ${usage}%`)
    }
    if (controlCenter) controlCenter.systemValue.set_label(`CPU ${usage}%`)
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
        setTooltip(refs.updateButton, updateRaw ? "<b>System Update</b>\nUpdates are available" : "")
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
    if (controlCenter) {
        controlCenter.quickVolumeValue.set_label(info.muted ? "Muted" : `${info.value}%`)
        controlCenter.volumeValue.set_label(info.muted ? "Muted" : `${info.value}%`)
        syncingVolume = true
        controlCenter.volumeScale.set_value(info.value)
        syncingVolume = false
    }
}

async function updateBrightness() {
    const info = await getBrightnessInfo()
    for (const refs of bars) {
        refs.brightness.set_label(info.text)
        setTooltip(refs.brightnessButton, `<b>Brightness</b>\n${info.value}%\nClick: open control center`)
    }
    if (controlCenter) {
        controlCenter.brightnessValue.set_label(`${info.value}%`)
        syncingBrightness = true
        controlCenter.brightnessScale.set_value(info.value)
        syncingBrightness = false
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
    if (controlCenter) {
        controlCenter.batteryQuickValue.set_label(`${info.value}%`)
        controlCenter.batteryValue.set_label(`${info.icon} ${info.value}%`)
        controlCenter.batteryMeta.set_label(
            [info.status, info.watts].filter(Boolean).join("   ") || "Battery details unavailable",
        )
    }
}

async function updateNetwork() {
    const [network, bluetooth] = await Promise.all([getNetworkInfo(), getBluetoothInfo()])
    for (const refs of bars) {
        refs.network.set_label(network.label)
        refs.bluetooth.set_label(bluetooth.label)
        setTooltip(refs.networkButton, network.tooltip)
        setTooltip(refs.bluetoothButton, bluetooth.tooltip)
    }
    if (controlCenter) {
        controlCenter.wifiQuickValue.set_label(network.label === "󰤮" ? "Offline" : "Connected")
        controlCenter.bluetoothQuickValue.set_label(bluetooth.icon === "󰂲" ? "Disabled" : "Ready")
        controlCenter.wifiValue.set_label(network.label === "󰤮" ? "Offline" : "Connected")
        controlCenter.bluetoothValue.set_label(bluetooth.icon === "󰂲" ? "Disabled" : "Ready")
        controlCenter.networkValue.set_label(network.icon === "󰤮" ? "No network" : "Network live")
        controlCenter.networkMeta.set_label(network.details)
    }
}

function refreshClocks() {
    for (const refs of bars) {
        refs.clock.set_label(localClockText())
        refs.indiaClock.set_label(indiaClockText())
    }
    if (controlCenter) {
        controlCenter.centerClock.set_label(GLib.DateTime.new_now_local()?.format("%A, %d %B   %H:%M") ?? "")
    }
}

function buildControlCenter(monitor: number): ControlCenterRefs {
    const brightnessValue = valueLabel("0%")
    const quickVolumeValue = valueLabel("0%")
    const volumeValue = valueLabel("0%")
    const wifiQuickValue = valueLabel("Offline")
    const bluetoothQuickValue = valueLabel("Disabled")
    const batteryQuickValue = valueLabel("0%")
    const wifiValue = valueLabel("Offline")
    const bluetoothValue = valueLabel("Disabled")
    const batteryValue = valueLabel("0%")
    const batteryMeta = valueLabel("")
    const networkValue = valueLabel("")
    const networkMeta = valueLabel("")
    const systemValue = valueLabel("")
    const centerWeather = valueLabel("")
    const centerClock = valueLabel("")

    const brightnessScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 1, 100, 1)
    brightnessScale.set_draw_value(false)
    brightnessScale.add_css_class("cc-slider")
    brightnessScale.connect("value-changed", () => {
        if (syncingBrightness) return
        if (brightnessTimer) GLib.source_remove(brightnessTimer)
        const value = Math.round(brightnessScale.get_value())
        brightnessValue.set_label(`${value}%`)
        brightnessTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            spawn(["brightnessctl", "set", `${value}%`])
            void updateBrightness()
            brightnessTimer = 0
            return GLib.SOURCE_REMOVE
        })
    })

    const volumeScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
    volumeScale.set_draw_value(false)
    volumeScale.add_css_class("cc-slider")
    volumeScale.connect("value-changed", () => {
        if (syncingVolume) return
        if (volumeTimer) GLib.source_remove(volumeTimer)
        const value = Math.round(volumeScale.get_value())
        volumeValue.set_label(`${value}%`)
        quickVolumeValue.set_label(`${value}%`)
        volumeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            spawn(["pamixer", "--set-volume", String(value)])
            void updateAudio()
            volumeTimer = 0
            return GLib.SOURCE_REMOVE
        })
    })

    const quickGrid = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 })
    quickGrid.append(controlTile("󰤨", "Wi-Fi", wifiQuickValue, () => spawn(["omarchy-launch-wifi"])))
    quickGrid.append(controlTile("", "Bluetooth", bluetoothQuickValue, () => spawn(["omarchy-launch-bluetooth"])))
    quickGrid.append(controlTile("󰕾", "Audio", quickVolumeValue, () => spawn(["omarchy-launch-audio"])))
    quickGrid.append(controlTile("", "Power", batteryQuickValue, () => spawn(["omarchy-menu", "power"])))

    const brightnessBlock = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
    brightnessBlock.add_css_class("detail-card")
    const brightnessTitle = valueLabel("Brightness")
    brightnessTitle.add_css_class("card-title")
    brightnessBlock.append(brightnessTitle)
    brightnessBlock.append(brightnessValue)
    brightnessBlock.append(brightnessScale)

    const volumeBlock = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
    volumeBlock.add_css_class("detail-card")
    const volumeTitle = valueLabel("Volume")
    volumeTitle.add_css_class("card-title")
    volumeBlock.append(volumeTitle)
    volumeBlock.append(volumeValue)
    volumeBlock.append(volumeScale)

    const batteryBlock = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    batteryBlock.add_css_class("detail-card")
    const batteryTitle = valueLabel("Battery")
    batteryTitle.add_css_class("card-title")
    batteryBlock.append(batteryTitle)
    batteryBlock.append(batteryValue)
    batteryBlock.append(batteryMeta)

    const networkBlock = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    networkBlock.add_css_class("detail-card")
    const networkTitle = valueLabel("Network")
    networkTitle.add_css_class("card-title")
    networkBlock.append(networkTitle)
    networkBlock.append(networkValue)
    networkBlock.append(networkMeta)

    const ambientBlock = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    ambientBlock.add_css_class("detail-card")
    const ambientTitle = valueLabel("Ambient")
    ambientTitle.add_css_class("card-title")
    ambientBlock.append(ambientTitle)
    ambientBlock.append(centerClock)
    ambientBlock.append(centerWeather)
    ambientBlock.append(systemValue)

    const left = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10 })
    left.append(quickGrid)

    const right = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10, hexpand: true })
    right.append(brightnessBlock)
    right.append(volumeBlock)
    right.append(batteryBlock)
    right.append(networkBlock)
    right.append(ambientBlock)

    const content = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 })
    content.append(left)
    content.append(right)

    const shell = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    shell.add_css_class("control-center")
    shell.append(content)

    const window = new Astal.Window({
        application: App,
        name: "control-center",
        monitor,
        anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT,
        exclusivity: Astal.Exclusivity.IGNORE,
        layer: Astal.Layer.OVERLAY,
        keymode: Astal.Keymode.ON_DEMAND,
        visible: false,
        child: shell,
    })
    setWindowMargins(window, 56, 18)

    return {
        window,
        brightnessScale,
        brightnessValue,
        quickVolumeValue,
        volumeScale,
        volumeValue,
        wifiQuickValue,
        bluetoothQuickValue,
        batteryQuickValue,
        wifiValue,
        bluetoothValue,
        batteryValue,
        batteryMeta,
        networkValue,
        networkMeta,
        systemValue,
        centerWeather,
        centerClock,
    }
}

function toggleControlCenter() {
    if (controlCenter) App.toggle_window(controlCenter.window.name)
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
    const updatedAt = valueLabel("")
    updatedAt.add_css_class("weather-updated")

    const currentText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true })
    currentText.append(currentTemp)
    currentText.append(currentCondition)
    currentText.append(currentMeta)
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
    const popover = new Gtk.Popover({
        autohide: true,
        has_arrow: false,
        position: Gtk.PositionType.BOTTOM,
    })
    popover.add_css_class("weather-shell")
    popover.set_child(card)
    popover.set_parent(anchor)

    return {
        popover,
        card,
        location,
        currentIcon,
        currentTemp,
        currentCondition,
        currentMeta,
        updatedAt,
        forecastBox,
    }
}

function buildBar(monitor: number): Astal.Window {
    const omarchyLabel = moduleLabel("<span font='omarchy'></span>")
    omarchyLabel.set_use_markup(true)
    const omarchyButton = moduleButton(["logo-button"], omarchyLabel, () => spawn(["omarchy-menu"]))
    addRightClick(omarchyButton, () => spawn(["xdg-terminal-exec"]))

    const workspaceBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 2 })
    workspaceBox.add_css_class("workspaces")

    const leftCapsule = capsule(["left-capsule"])
    leftCapsule.set_spacing(3)
    leftCapsule.append(omarchyButton)
    leftCapsule.append(workspaceBox)

    const weather = moduleLabel("󰖪 --")
    const weatherButton = moduleButton(["weather"], weather)
    const weatherPanel = buildWeatherPanel(weatherButton)
    weatherButton.connect("clicked", () => togglePopover(weatherPanel.popover))
    addRightClick(weatherButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "nvim", `${HOME}/.config/waybar/scripts/weather.sh`]))

    const clock = moduleLabel(localClockText())
    const clockButton = moduleButton(["clock"], clock)
    addRightClick(clockButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "omarchy-tz-select"]))
    setTooltip(clockButton, "<b>Clock</b>\nRight-click: change timezone")

    const indiaClock = moduleLabel(indiaClockText())
    const indiaButton = moduleButton(["clock", "india"], indiaClock)

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
    centerCapsule.set_spacing(4)
    ;[weatherButton, clockButton, indiaButton, privacyButton, updateButton, voxtypeButton, recordButton, idleButton, notifButton].forEach((widget) => centerCapsule.append(widget))

    const bluetooth = moduleLabel("")
    const bluetoothButton = moduleButton(["compact"], bluetooth, () => spawn(["omarchy-launch-bluetooth"]))

    const network = moduleLabel("󰤮")
    const networkButton = moduleButton(["compact"], network, () => spawn(["omarchy-launch-wifi"]))

    const audio = moduleLabel("󰕿")
    const audioButton = moduleButton(["compact"], audio, () => spawn(["omarchy-launch-audio"]))
    addRightClick(audioButton, () => spawn(["pamixer", "-t"]))
    addScroll(audioButton, () => spawn(["pamixer", "--increase", "2"]), () => spawn(["pamixer", "--decrease", "2"]))

    const brightness = moduleLabel("󰃟 0%")
    const brightnessButton = moduleButton(["compact", "brightness"], brightness, () => toggleControlCenter())
    addScroll(brightnessButton, () => spawn(["brightnessctl", "set", "+5%"]), () => spawn(["brightnessctl", "set", "5%-"]))

    const cpu = moduleLabel("󰍛 0%")
    const cpuButton = moduleButton(["metric"], cpu, () => spawn(["omarchy-launch-or-focus-tui", "btop"]))
    addRightClick(cpuButton, () => spawn(["alacritty"]))

    const memory = moduleLabel("󰘚 0.0GB")
    const memoryButton = moduleButton(["metric"], memory, () => spawn(["omarchy-launch-or-focus-tui", "btop"]))

    const battery = moduleLabel("󰁹 0%")
    const batteryButton = moduleButton(["battery"], battery, () => spawn(["omarchy-menu", "power"]))
    addRightClick(batteryButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "battery-zen", "tui"]))

    const rightCapsule = capsule(["right-capsule"])
    rightCapsule.set_spacing(6)
    ;[bluetoothButton, networkButton, audioButton, brightnessButton, cpuButton, memoryButton, batteryButton].forEach((widget) => rightCapsule.append(widget))

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

    const root = new Gtk.Overlay({ hexpand: true })
    root.set_child(track)
    root.add_overlay(centerCapsule)

    const shell = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
    shell.add_css_class("bar-shell")
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

        controlCenter = buildControlCenter(0)
        App.add_window(controlCenter.window)

        poll(1, refreshClocks)
        poll(3, updateNetwork)
        poll(4, updateAudio)
        poll(5, updateCpu)
        poll(5, updateMemory)
        poll(5, updateBattery)
        poll(5, updateBrightness)
        poll(1, updatePrivacy)
        poll(8, updateIndicators)
        poll(60, updateWeather)
        void updateWorkspaces()
        connectHyprlandEvents()
    },
})
