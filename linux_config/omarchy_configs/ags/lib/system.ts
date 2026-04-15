import GLib from "gi://GLib?version=2.0";
import { run, safeRead, sh } from "./helpers";
import type { AudioInfo, BatteryInfo, BluetoothInfo, BrightnessInfo, NetworkInfo } from "./types";

let previousCpu: { idle: number; total: number } | null = null
let previousTraffic: { rx: number; tx: number; timestamp: number } | null = null

export function localClockText() {
    return GLib.DateTime.new_now_local()?.format("  %a, %d %b   󰥔  %H:%M") ?? ""
}

export function indiaClockText() {
    return GLib.DateTime.new_now(GLib.TimeZone.new("Asia/Kolkata"))?.format(" %H:%M") ?? ""
}

export async function getBrightnessInfo(): Promise<BrightnessInfo> {
    const raw = await run(["brightnessctl", "-m", "info"])
    const parts = raw.split(",")
    const value = Number.parseInt((parts[3] ?? "0").replace("%", ""), 10) || 0
    const icon = value >= 75 ? "󰃠" : value >= 35 ? "󰃟" : "󰃞"
    return { icon, value, text: `${icon}  ${value}%` }
}

export async function getAudioInfo(): Promise<AudioInfo> {
    const volumeRaw = await run(["pamixer", "--get-volume"])
    const mutedRaw = await run(["pamixer", "--get-mute"])
    const sinkRaw = await sh("pactl info | sed -n 's/^Default Sink: //p'")
    const value = Number.parseInt(volumeRaw, 10) || 0
    const muted = mutedRaw === "true"
    const icon = muted ? "" : value >= 67 ? "󰕾" : value >= 34 ? "󰖀" : "󰕿"
    const sink = sinkRaw || "Default output"
    return {
        icon,
        value,
        muted,
        text: icon,
        tooltip: `<b>Volume</b>\n${muted ? "Muted" : `${value}%`}\n${sink}`,
    }
}

function parseDefaultInterface(): string {
    const route = safeRead("/proc/net/route")
    for (const line of route.split("\n").slice(1)) {
        const fields = line.trim().split(/\s+/)
        if (fields[1] === "00000000") return fields[0]
    }
    return ""
}

function readTrafficBytes(iface: string): { rx: number; tx: number } {
    const raw = safeRead("/proc/net/dev")
    const line = raw
        .split("\n")
        .find((entry) => entry.trim().startsWith(`${iface}:`))
    if (!line) return { rx: 0, tx: 0 }
    const [, data] = line.split(":")
    const fields = data.trim().split(/\s+/)
    return {
        rx: Number.parseInt(fields[0] ?? "0", 10) || 0,
        tx: Number.parseInt(fields[8] ?? "0", 10) || 0,
    }
}

function formatRate(bytesPerSecond: number): string {
    if (bytesPerSecond > 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    if (bytesPerSecond > 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`
    return `${Math.round(bytesPerSecond)} B/s`
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
    const iface = parseDefaultInterface()
    if (!iface) {
        return {
            icon: "󰤮",
            label: "󰤮",
            tooltip: "<b>Network</b>\nDisconnected",
            details: "No active network",
        }
    }

    const now = Date.now()
    const traffic = readTrafficBytes(iface)
    const ip = await sh(`ip -4 -o addr show dev ${iface} | awk '{print $4}' | cut -d/ -f1`)

    let down = 0
    let up = 0
    if (previousTraffic) {
        const seconds = Math.max((now - previousTraffic.timestamp) / 1000, 1)
        down = (traffic.rx - previousTraffic.rx) / seconds
        up = (traffic.tx - previousTraffic.tx) / seconds
    }
    previousTraffic = { ...traffic, timestamp: now }

    const wireless = iface.startsWith("wl")
    const icon = wireless ? "󰤨" : "󰀂"
    const speedText = `⇣ ${formatRate(down)}   ⇡ ${formatRate(up)}`
    return {
        icon,
        label: icon,
        tooltip: `<b>${wireless ? "Wi-Fi" : "Ethernet"}</b>\n${ip || "No IP"}\n${speedText}`,
        details: `${iface}  ${ip || "No IP"}\n${speedText}`,
    }
}

export async function getBluetoothInfo(): Promise<BluetoothInfo> {
    const raw = await run(["rfkill", "--json"])
    const data = JSON.parse(raw || '{"rfkilldevices": []}') as {
        rfkilldevices?: Array<{ type?: string; soft?: string }>
    }
    const devices = data.rfkilldevices ?? []
    const bluetooth = devices.find((entry) => entry.type === "bluetooth")
    const blocked = bluetooth?.soft === "blocked"
    return {
        icon: blocked ? "󰂲" : "",
        label: blocked ? "󰂲" : "",
        tooltip: `<b>Bluetooth</b>\n${blocked ? "Disabled" : "Ready"}`,
    }
}

function batteryIcon(level: number, status: string): string {
    const chargingIcons = ["󰢜", "󰂆", "󰂇", "󰂈", "󰢝", "󰂉", "󰢞", "󰂊", "󰂋", "󰂅"]
    const defaultIcons = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"]
    const index = Math.min(Math.floor(level / 10), 9)
    return status === "Charging" ? chargingIcons[index] : defaultIcons[index]
}

function readWatts(base: string): number {
    const powerNow = Number.parseInt(safeRead(`${base}/power_now`, "0"), 10)
    if (powerNow > 0) return powerNow / 1_000_000
    const currentNow = Number.parseInt(safeRead(`${base}/current_now`, "0"), 10)
    const voltageNow = Number.parseInt(safeRead(`${base}/voltage_now`, "0"), 10)
    if (currentNow > 0 && voltageNow > 0) return (currentNow * voltageNow) / 1_000_000_000_000
    return 0
}

export function getBatteryInfo(): BatteryInfo {
    const base = "/sys/class/power_supply/BAT1"
    const capacity = Number.parseInt(safeRead(`${base}/capacity`, "0"), 10) || 0
    const status = safeRead(`${base}/status`, "Unknown")
    const health = safeRead(`${base}/health`, "")
    const cycles = safeRead(`${base}/cycle_count`, "")
    const watts = readWatts(base)
    const wattsText = watts > 0 ? `${watts.toFixed(0)}W` : ""
    const icon = status === "Full" ? "󰂅" : batteryIcon(capacity, status)

    let text = `${icon}  ${capacity}%`
    if (status === "Charging" && wattsText) text = `${icon}  ${wattsText}↑  ${capacity}%`
    if (status === "Discharging" && wattsText) text = `${icon}  ${wattsText}↓  ${capacity}%`
    if (status === "Not charging") text = `  ${capacity}%`

    const levelClass = capacity <= 10 ? "critical" : capacity <= 20 ? "warning" : ""
    const tooltip = [
        `<b>Battery</b>`,
        `Status: ${status}`,
        `Charge: ${capacity}%`,
        wattsText ? `Power: ${wattsText}` : "",
        health ? `Health: ${health}` : "",
        cycles ? `Cycles: ${cycles}` : "",
    ]
        .filter(Boolean)
        .join("\n")

    return { icon, text, tooltip, levelClass, value: capacity, watts: wattsText, status }
}

export function getCpuUsage(): number {
    const stat = safeRead("/proc/stat")
        .split("\n")
        .find((line) => line.startsWith("cpu "))
    if (!stat) return 0

    const fields = stat.trim().split(/\s+/).slice(1).map((value) => Number.parseInt(value, 10) || 0)
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
    const total = fields.reduce((sum, value) => sum + value, 0)

    if (!previousCpu) {
        previousCpu = { idle, total }
        return 0
    }

    const idleDelta = idle - previousCpu.idle
    const totalDelta = total - previousCpu.total
    previousCpu = { idle, total }
    if (totalDelta <= 0) return 0
    return Math.round(100 * (1 - idleDelta / totalDelta))
}
