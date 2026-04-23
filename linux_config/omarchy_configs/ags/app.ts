import { Astal, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { compact, parseJson, poll, run, safeRead, sh, spawn } from "./lib/helpers"
import { AUDIO_OSD_SCRIPT, CPU_SCRIPT, HOME, IDLE_SCRIPT, MEMORY_SCRIPT, NOTIF_SCRIPT, SCREENREC_SCRIPT, WEATHER_AGS_SCRIPT, WEATHER_POPUP_TRIGGER } from "./lib/paths"
import { getAudioInfo, getBatteryInfo, getBluetoothInfo, getBrightnessInfo, getBrightnessWatchPaths, getNetworkInfo, getPrivacyInfo, indiaClockText, localClockText } from "./lib/system"
import { applyDynamicCss, watchStyle } from "./lib/theme"
import type { BarRefs, WeatherData, WeatherPanelRefs } from "./lib/types"
import { applyWeatherData, buildWeatherPanel, parseWeatherData, scheduleWeatherPanelRelayout, toggleWeatherWindow, withPrimaryWeatherCity } from "./lib/weather"
import { addRightClick, addScroll, capsule, moduleButton, moduleLabel, setTooltip, setWindowMargins, workspaceButton } from "./lib/widgets"

const bars: BarRefs[] = []
let hyprSocketStream: Gio.DataInputStream | null = null
const brightnessMonitors: Gio.FileMonitor[] = []
let weatherPopupTriggerMonitor: Gio.FileMonitor | null = null
let weatherPopupTriggerTimer = 0
let lastWeatherPopupToken = ""
let monitorRefreshTimer = 0
let audioSubscribeProcess: Gio.Subprocess | null = null
let audioSubscribeStream: Gio.DataInputStream | null = null
let audioRefreshTimer = 0
let pendingAudioScrollDelta = 0
let audioScrollFlushTimer = 0
let lastWeatherData: WeatherData | null = null
let pendingWeatherPrimaryId: string | null = null
let weatherPrimarySyncInFlight = false
let lastWeatherScrollDirection: "next" | "prev" | null = null
let lastWeatherScrollAtUsec = 0
let weatherScrollCooldownUntilUsec = 0
let desiredWeatherPrimaryId: string | null = null
let weatherRequestToken = 0
let latestWeatherAppliedToken = 0

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

function scheduleAudioRefreshBurst() {
    scheduleAudioRefresh()
    ;[160, 360].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            scheduleAudioRefresh()
            return GLib.SOURCE_REMOVE
        })
    })
}

function adjustAudioWithOsd(action: "raise" | "lower" | "mute-toggle", step?: number) {
    const cmd = [AUDIO_OSD_SCRIPT, action]
    if (typeof step === "number") cmd.push(String(step))
    spawn(cmd)
}

function queueAudioScroll(delta: number) {
    pendingAudioScrollDelta += delta
    if (audioScrollFlushTimer) return

    audioScrollFlushTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 24, () => {
        const totalDelta = pendingAudioScrollDelta
        pendingAudioScrollDelta = 0
        audioScrollFlushTimer = 0

        if (totalDelta > 0) adjustAudioWithOsd("raise", totalDelta * 2)
        else if (totalDelta < 0) adjustAudioWithOsd("lower", Math.abs(totalDelta) * 2)

        scheduleAudioRefreshBurst()
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

type WeatherPopupTrigger = {
    token?: string
    monitor?: number
    monitorName?: string
}

function barMonitorName(monitor: number): string {
    const monitorInfo = App.get_monitors()[monitor] as
        | ({ get_connector?: () => string | null; connector?: string | null })
        | undefined
    return monitorInfo?.get_connector?.() ?? monitorInfo?.connector ?? ""
}

function toggleWeatherForBar(refs: BarRefs) {
    const panel = refs.weatherPanel
    const anchorButton = panel.anchorButton
    const shell = panel.shell
    const monitorWidth = panel.monitorWidth
    const panelWidth = panel.panelWidth
    if (!anchorButton || !shell || !monitorWidth || !panelWidth) return

    toggleWeatherWindow(bars, panel, anchorButton, shell, monitorWidth, panelWidth)
}

function handleWeatherPopupTrigger() {
    const raw = safeRead(WEATHER_POPUP_TRIGGER)
    if (!raw) return

    const trigger = parseJson<WeatherPopupTrigger>(raw, {})
    if (!trigger.token || trigger.token === lastWeatherPopupToken) return
    lastWeatherPopupToken = trigger.token

    const target = bars.find((refs) =>
        (trigger.monitorName && refs.monitorName === trigger.monitorName)
        || (typeof trigger.monitor === "number" && refs.monitor === trigger.monitor),
    ) ?? bars[0]

    if (target) toggleWeatherForBar(target)
}

function connectWeatherPopupTrigger() {
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

            if (weatherPopupTriggerTimer) GLib.source_remove(weatherPopupTriggerTimer)
            weatherPopupTriggerTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
                weatherPopupTriggerTimer = 0
                handleWeatherPopupTrigger()
                return GLib.SOURCE_REMOVE
            })
        })
        weatherPopupTriggerMonitor = monitor
    } catch {}
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

function renderWeatherData(data: WeatherData, optimistic = false) {
    if (optimistic) {
        lastWeatherData = data
        applyWeatherData(bars, data, {
            setPrimaryCity: (cityId) => {
                void setPrimaryWeatherCity(cityId)
            },
            removeCity: (cityId) => {
                void removeWeatherCity(cityId)
            },
        })
        return
    }

    let resolved = data
    if (desiredWeatherPrimaryId) {
        const hasDesiredCity = (data.cities ?? []).some((city) => city.id === desiredWeatherPrimaryId)
        if (hasDesiredCity) {
            const activeId = data.primary_city?.id
            if (activeId !== desiredWeatherPrimaryId) {
                resolved = withPrimaryWeatherCity(data, desiredWeatherPrimaryId)
            }
        } else {
            desiredWeatherPrimaryId = null
        }
    }

    if (
        desiredWeatherPrimaryId &&
        data.primary_city?.id === desiredWeatherPrimaryId &&
        !weatherPrimarySyncInFlight &&
        !pendingWeatherPrimaryId
    ) {
        desiredWeatherPrimaryId = null
    }

    lastWeatherData = resolved
    applyWeatherData(bars, resolved, {
        setPrimaryCity: (cityId) => {
            void setPrimaryWeatherCity(cityId)
        },
        removeCity: (cityId) => {
            void removeWeatherCity(cityId)
        },
    })
}

async function runWeatherAction(args: string[]) {
    const token = ++weatherRequestToken
    const raw = await run([WEATHER_AGS_SCRIPT, ...args])
    const data = parseWeatherData(raw)

    if (token < latestWeatherAppliedToken) {
        return data
    }

    latestWeatherAppliedToken = token
    renderWeatherData(data)
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
        sh(`if command -v voxtype >/dev/null && omarchy-cmd-present voxtype; then
            voxtype status --extended --format json | jq -c '. + {alt: .class}'
        else
            printf '{"alt":"","tooltip":""}'
        fi`),
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
    desiredWeatherPrimaryId = cityId
    if (lastWeatherData) renderWeatherData(withPrimaryWeatherCity(lastWeatherData, cityId), true)
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

    desiredWeatherPrimaryId = nextCity.id
    renderWeatherData(withPrimaryWeatherCity(lastWeatherData!, nextCity.id), true)
    queueWeatherPrimarySelection(nextCity.id)
}

function handleWeatherScroll(direction: "next" | "prev") {
    const nowUsec = GLib.get_monotonic_time()
    const baseCooldownUsec = 140_000
    const reboundCooldownUsec = 220_000
    const withinCooldownWindow = nowUsec < weatherScrollCooldownUntilUsec
    if (withinCooldownWindow) {
        if (lastWeatherScrollDirection && lastWeatherScrollDirection !== direction) {
            weatherScrollCooldownUntilUsec = nowUsec + reboundCooldownUsec
        }
        return
    }

    const withinBounceWindow = nowUsec - lastWeatherScrollAtUsec < reboundCooldownUsec
    if (withinBounceWindow && lastWeatherScrollDirection && lastWeatherScrollDirection !== direction) return

    lastWeatherScrollDirection = direction
    lastWeatherScrollAtUsec = nowUsec
    weatherScrollCooldownUntilUsec = nowUsec + baseCooldownUsec
    void cycleWeather(direction)
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
    const weatherPanel = buildWeatherPanel(monitor, compactLayout, weatherPanelWidth, {
        addCity: (panel) => {
            void addWeatherCity(panel)
        },
        refreshNow: () => {
            void refreshWeatherNow()
        },
    })
    weatherButton.connect("clicked", () => {
        toggleWeatherWindow(bars, weatherPanel, weatherButton, shell, monitorWidth, weatherPanelWidth)
    })
    let weatherScrollAccum = 0
    let weatherScrollSettleTimer = 0
    const weatherScrollController = Gtk.EventControllerScroll.new(Gtk.EventControllerScrollFlags.VERTICAL)
    weatherScrollController.connect("scroll", (_controller, _dx, dy) => {
        // Accumulate smooth touchpad deltas, then emit a single discrete city step.
        if (Math.abs(dy) < 0.02) return true
        weatherScrollAccum += dy

        if (weatherScrollSettleTimer) GLib.source_remove(weatherScrollSettleTimer)
        weatherScrollSettleTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            weatherScrollAccum = 0
            weatherScrollSettleTimer = 0
            return GLib.SOURCE_REMOVE
        })

        if (Math.abs(weatherScrollAccum) < 0.7) return true

        handleWeatherScroll(weatherScrollAccum < 0 ? "next" : "prev")
        weatherScrollAccum = 0
        return true
    })
    weatherButton.add_controller(weatherScrollController)
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
        adjustAudioWithOsd("mute-toggle")
        scheduleAudioRefreshBurst()
    })
    addScroll(
        audioButton,
        () => {
            queueAudioScroll(1)
        },
        () => {
            queueAudioScroll(-1)
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
    addRightClick(batteryButton, () => spawn(["omarchy-launch-or-focus-tui", "battery-zen tui"]))

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
        monitor,
        monitorName: barMonitorName(monitor),
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
        poll(10, updateNetwork)
        poll(10, updateCpu)
        poll(10, updateMemory)
        poll(10, updateBattery)
        poll(5, updateBrightness)
        poll(1, updatePrivacy)
        poll(8, updateIndicators)
        poll(60, updateWeather)
        poll(30, updateAudio)
        void connectBrightnessWatch()
        connectAudioEvents()
        connectWeatherPopupTrigger()
        void updateWorkspaces()
        connectHyprlandEvents()
    },
})
