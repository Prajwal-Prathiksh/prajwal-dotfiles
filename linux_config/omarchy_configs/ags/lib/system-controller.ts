import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { compact, parseJson, run, sh, spawn } from "./helpers"
import { CPU_SCRIPT, IDLE_SCRIPT, MEMORY_SCRIPT, NOTIF_SCRIPT, SCREENREC_SCRIPT } from "./paths"
import {
    getBatteryInfo,
    getBluetoothInfo,
    getBrightnessInfo,
    getBrightnessWatchPaths,
    getNetworkInfo,
    getPrivacyInfo,
    indiaClockText,
    localClockText,
    localClockTooltip,
} from "./system-info"
import type { BarRefs } from "./types"
import { setTooltip } from "./widgets"

export type SystemController = {
    connectBrightnessWatch: () => Promise<void>
    refreshClocks: () => void
    updateNetwork: () => Promise<void>
    updateCpu: () => Promise<void>
    updateMemory: () => Promise<void>
    updateBattery: () => Promise<void>
    updateBrightness: () => Promise<void>
    updatePrivacy: () => Promise<void>
    updateIndicators: () => Promise<void>
    toggleRecording: () => void
    toggleNightLight: () => void
    scrollBrightness: (direction: "up" | "down") => void
}

export function createSystemController(bars: BarRefs[]): SystemController {
    const brightnessMonitors: Gio.FileMonitor[] = []

    function schedulePrivacyRefresh() {
        const delays = [80, 220, 500, 900]
        delays.forEach((delay) => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                void updatePrivacy()
                return GLib.SOURCE_REMOVE
            })
        })
    }

    function scheduleBrightnessRefresh() {
        const delays = [50, 140, 260]
        delays.forEach((delay) => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                void updateBrightness()
                return GLib.SOURCE_REMOVE
            })
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

    function refreshClocks() {
        for (const refs of bars) {
            refs.clocks.clock.set_label(localClockText())
            setTooltip(refs.clocks.clockButton, localClockTooltip())
            refs.clocks.indiaClock.set_label(indiaClockText())
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
            refs.metrics.memory.set_label(text)
            refs.metrics.memoryButton.remove_css_class("warning")
            refs.metrics.memoryButton.remove_css_class("critical")
            if (data.class) refs.metrics.memoryButton.add_css_class(data.class)
            setTooltip(refs.metrics.memoryButton, tooltip)
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
            refs.metrics.cpu.set_label(text)
            refs.metrics.cpuButton.remove_css_class("warning")
            refs.metrics.cpuButton.remove_css_class("critical")
            if (data.class === "critical") refs.metrics.cpuButton.add_css_class("critical")
            else if (data.class === "warning") refs.metrics.cpuButton.add_css_class("warning")
            setTooltip(refs.metrics.cpuButton, tooltip)
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
            refs.status.idle.set_label(idle.text ?? "")
            refs.status.idleButton.set_visible(Boolean(idle.text))
            refs.status.notif.set_label(notif.text ?? "")
            refs.status.notifButton.set_visible(Boolean(notif.text))
            refs.status.voxtype.set_label(voxtypeIcon)
            refs.status.voxtypeButton.set_visible(Boolean(voxtypeIcon))
            refs.status.update.set_label(updateRaw ? "" : "")
            refs.status.updateButton.set_visible(Boolean(updateRaw))

            setTooltip(refs.status.idleButton, idle.tooltip ?? "")
            setTooltip(refs.status.notifButton, notif.tooltip ?? "")
            setTooltip(refs.status.voxtypeButton, voxtype.tooltip ?? "")
            setTooltip(refs.status.updateButton, updateRaw ? "<b>System Update</b>\n<tt>Status  Updates available</tt>" : "")
        }
    }

    async function updatePrivacy() {
        const [privacy, recordRaw] = await Promise.all([
            getPrivacyInfo(),
            run([SCREENREC_SCRIPT]),
        ])
        const record = parseJson<{ text?: string; tooltip?: string; class?: string }>(recordRaw, {})

        for (const refs of bars) {
            refs.status.privacy.set_label(privacy.text)
            refs.status.privacyButton.set_visible(Boolean(privacy.text))
            refs.status.privacyButton.remove_css_class("critical")
            if (privacy.micActive || privacy.cameraActive || privacy.screenActive) refs.status.privacyButton.add_css_class("critical")
            setTooltip(refs.status.privacyButton, privacy.tooltip)

            refs.status.record.set_label(record.text ?? "")
            refs.status.recordButton.set_visible(Boolean(record.text))
            refs.status.recordButton.remove_css_class("critical")
            if (record.class === "active") refs.status.recordButton.add_css_class("critical")
            setTooltip(refs.status.recordButton, record.tooltip ?? "")
        }
    }

    async function updateBrightness() {
        const info = await getBrightnessInfo()
        const filled = Math.max(0, Math.min(8, Math.round(info.value / 12.5)))
        const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`
        for (const refs of bars) {
            refs.connectivity.brightness.set_label(info.text)
            setTooltip(
                refs.connectivity.brightnessButton,
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
            refs.metrics.battery.set_label(info.text)
            refs.metrics.batteryButton.remove_css_class("charging")
            refs.metrics.batteryButton.remove_css_class("warning")
            refs.metrics.batteryButton.remove_css_class("critical")
            if (info.status === "Charging") refs.metrics.batteryButton.add_css_class("charging")
            if (info.levelClass) refs.metrics.batteryButton.add_css_class(info.levelClass)
            setTooltip(refs.metrics.batteryButton, info.tooltip)
        }
    }

    async function updateNetwork() {
        const [network, bluetooth] = await Promise.all([getNetworkInfo(), getBluetoothInfo()])
        for (const refs of bars) {
            refs.connectivity.network.set_label(network.label)
            refs.connectivity.bluetooth.set_label(bluetooth.label)
            refs.connectivity.bluetoothButton.remove_css_class("connected")
            if (bluetooth.connected) refs.connectivity.bluetoothButton.add_css_class("connected")
            setTooltip(refs.connectivity.networkButton, network.tooltip)
            setTooltip(refs.connectivity.bluetoothButton, bluetooth.tooltip)
        }
    }

    function toggleRecording() {
        spawn(["omarchy-cmd-screenrecord"])
        schedulePrivacyRefresh()
    }

    function toggleNightLight() {
        spawn(["omarchy-toggle-nightlight"])
        scheduleBrightnessRefresh()
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1100, () => {
            void updateBrightness()
            return GLib.SOURCE_REMOVE
        })
    }

    function scrollBrightness(direction: "up" | "down") {
        spawn(["omarchy-brightness-display", direction === "up" ? "+5%" : "5%-"])
        scheduleBrightnessRefresh()
    }

    return {
        connectBrightnessWatch,
        refreshClocks,
        updateNetwork,
        updateCpu,
        updateMemory,
        updateBattery,
        updateBrightness,
        updatePrivacy,
        updateIndicators,
        toggleRecording,
        toggleNightLight,
        scrollBrightness,
    }
}
