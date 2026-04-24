import GLib from "gi://GLib?version=2.0";
import Gio from "gi://Gio?version=2.0";
import { parseJson, run, safeRead, sh } from "./helpers";
import type { AudioInfo, BatteryInfo, BluetoothInfo, BrightnessInfo, NetworkInfo, PrivacyInfo } from "./types";

let previousCpu: { idle: number; total: number } | null = null
let previousTraffic: { rx: number; tx: number; timestamp: number } | null = null

export function localClockText() {
    return GLib.DateTime.new_now_local()?.format("  %a, %d %b   󰥔  %H:%M") ?? ""
}

export function indiaClockText() {
    return GLib.DateTime.new_now(GLib.TimeZone.new("Asia/Kolkata"))?.format(" %H:%M") ?? ""
}

export async function getBrightnessInfo(): Promise<BrightnessInfo> {
    const [raw, hyprsunsetRaw] = await Promise.all([
        run(["brightnessctl", "-m", "info"]),
        sh("hyprctl hyprsunset temperature 2>/dev/null | grep -oE '[0-9]+' | head -n1"),
    ])
    const parts = raw.split(",")
    const value = Number.parseInt((parts[3] ?? "0").replace("%", ""), 10) || 0
    const temperature = Number.parseInt(hyprsunsetRaw.trim(), 10) || 6000
    const nightLight = temperature < 6000
    const icon = nightLight ? "" : value >= 75 ? "󰃠" : value >= 35 ? "󰃟" : "󰃞"
    return { icon, value, text: `${icon}  ${value}%`, nightLight }
}

export async function getBrightnessWatchPaths(): Promise<string[]> {
    const raw = await sh(`
        for d in /sys/class/backlight/*; do
            [ -e "$d/actual_brightness" ] && printf '%s\n' "$d/actual_brightness"
        done
    `)

    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
}

export async function getAudioInfo(): Promise<AudioInfo> {
    const [wpctlRaw, sinkRaw, sinkDescriptionRaw] = await Promise.all([
        run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"]),
        sh("pactl info | sed -n 's/^Default Sink: //p'"),
        sh(`
            default_sink="$(pactl info | sed -n 's/^Default Sink: //p' | head -n1)"
            [ -n "$default_sink" ] || exit 0
            pactl list sinks | awk -v target="$default_sink" '
                $1 == "Name:" { in_sink = ($2 == target) }
                in_sink && $1 == "Description:" {
                    sub(/^[[:space:]]*Description:[[:space:]]*/, "")
                    print
                    exit
                }
            '
        `),
    ])
    const volumeMatch = wpctlRaw.match(/Volume:\s+([0-9.]+)/)
    const value = Math.round((Number.parseFloat(volumeMatch?.[1] ?? "0") || 0) * 100)
    const muted = wpctlRaw.includes("[MUTED]")
    const baseIcon = muted || value === 0 ? "" : value >= 67 ? "󰕾" : value >= 34 ? "󰖀" : "󰕿"
    const sinkName = sinkRaw.trim()
    const sinkDescription = sinkDescriptionRaw.trim() || sinkName || "Default output"
    const bluetooth = sinkName.startsWith("bluez_output.") || /bluetooth/i.test(sinkDescription)
    const icon = bluetooth ? `${baseIcon}` : baseIcon
    const filled = Math.max(0, Math.min(8, Math.round(value / 12.5)))
    const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`

    return {
        icon,
        value,
        muted,
        text: icon,
        tooltip: [
            "<b>Audio</b>",
            `<tt>${muted ? "Muted".padEnd(5, " ") : `${String(value).padStart(2, "0")}%`.padEnd(5, " ")}  ${bar}</tt>`,
            "",
            `<tt>Device  ${sinkDescription}</tt>`,
        ].join("\n"),
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

function wifiIconFromStrength(strength: number): string {
    if (strength <= 20) return "󰤯"
    if (strength <= 40) return "󰤟"
    if (strength <= 60) return "󰤢"
    if (strength <= 80) return "󰤥"
    return "󰤨"
}

function dbmToPercent(dbm: number): number {
    if (dbm <= -90) return 0
    if (dbm >= -50) return 100
    return Math.round(((dbm + 90) / 40) * 100)
}

function formatFrequencyLabel(freq: number): string {
    if (!freq) return ""
    const ghz = freq >= 1000 ? freq / 1000 : freq
    return `${ghz.toFixed(1)} GHz`
}

async function getWifiAccessPointInfo(iface: string): Promise<{ ssid: string; strength: number; frequencyLabel: string; signalDbm: number | null } | null> {
    const raw = await sh(`iw dev ${iface} link 2>/dev/null || true`)
    if (!raw || raw.includes("Not connected.")) return null

    const ssid = raw.match(/^\s*SSID:\s+(.+)$/m)?.[1]?.trim() ?? ""
    const freq = Number.parseFloat(raw.match(/^\s*freq:\s+([0-9.]+)$/m)?.[1] ?? "0")
    const signalDbm = Number.parseFloat(raw.match(/^\s*signal:\s+(-?[0-9.]+)\s+dBm$/m)?.[1] ?? "")
    const strength = Number.isFinite(signalDbm) ? dbmToPercent(signalDbm) : 0

    return {
        ssid: ssid || iface,
        strength,
        frequencyLabel: formatFrequencyLabel(freq),
        signalDbm: Number.isFinite(signalDbm) ? signalDbm : null,
    }
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
    const iface = parseDefaultInterface()
    if (!iface) {
        return {
            icon: "󰤮",
            label: "󰤮",
            tooltip: [
                "<b>Network</b>",
                `<tt>Status   Offline</tt>`,
            ].join("\n"),
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
    const wifi = wireless ? await getWifiAccessPointInfo(iface) : null
    const icon = wireless ? wifiIconFromStrength(wifi?.strength ?? 100) : "󰀂"
    const downText = formatRate(down)
    const upText = formatRate(up)
    const speedText = `⇣ ${downText}   ⇡ ${upText}`
    return {
        icon,
        label: icon,
        tooltip: wireless
            ? [
                "<b>Wi-Fi</b>",
                `<tt>Name     ${wifi?.ssid || iface}${wifi?.frequencyLabel ? ` (${wifi.frequencyLabel})` : ""}</tt>`,
                `<tt>Signal   ${String(wifi?.strength ?? 0).padStart(2, "0")}%${wifi?.signalDbm !== null ? `   ${Math.round(wifi.signalDbm)} dBm` : ""}</tt>`,
                `<tt>Address  ${ip || "No IP"}</tt>`,
                `<tt>Down     ${downText}</tt>`,
                `<tt>Up       ${upText}</tt>`,
            ].join("\n")
            : [
                "<b>Ethernet</b>",
                `<tt>Device   ${iface}</tt>`,
                `<tt>Address  ${ip || "No IP"}</tt>`,
                `<tt>Down     ${downText}</tt>`,
                `<tt>Up       ${upText}</tt>`,
            ].join("\n"),
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
    if (blocked) {
        return {
            icon: "󰂲",
            label: "󰂲",
            tooltip: [
                "<b>Bluetooth</b>",
                `<tt>Status    Disabled</tt>`,
                `<tt>Connected 0 devices</tt>`,
            ].join("\n"),
            connected: false,
        }
    }

    try {
        const manager = Gio.DBusObjectManagerClient.new_for_bus_sync(
            Gio.BusType.SYSTEM,
            Gio.DBusObjectManagerClientFlags.NONE,
            "org.bluez",
            "/",
            null,
            null,
        )

        let controllerAlias = "Controller"
        const connectedDevices: Array<{ name: string; mac: string; battery: number | null }> = []

        manager.get_objects().forEach((object) => {
            const adapter = object.get_interface("org.bluez.Adapter1") as Gio.DBusProxy | null
            if (adapter && controllerAlias === "Controller") {
                controllerAlias = adapter.get_cached_property("Alias")?.unpack() ?? controllerAlias
            }

            const device = object.get_interface("org.bluez.Device1") as Gio.DBusProxy | null
            if (!device) return

            const connected = Boolean(device.get_cached_property("Connected")?.unpack())
            if (!connected) return

            const name =
                device.get_cached_property("Alias")?.unpack() ??
                device.get_cached_property("Name")?.unpack() ??
                "Bluetooth device"
            const mac = device.get_cached_property("Address")?.unpack() ?? ""
            const batteryIface = object.get_interface("org.bluez.Battery1") as Gio.DBusProxy | null
            const batteryRaw = batteryIface?.get_cached_property("Percentage")?.unpack()
            const battery = typeof batteryRaw === "number" ? Math.round(batteryRaw) : null
            connectedDevices.push({ name, mac, battery })
        })

        const connected = connectedDevices.length > 0
        const icon = connected ? "󰂱" : ""
        const tooltip = [
            "<b>Bluetooth</b>",
            `<tt>Device    ${controllerAlias}</tt>`,
            `<tt>Connected ${connectedDevices.length} device${connectedDevices.length === 1 ? "" : "s"}</tt>`,
            ...connectedDevices.map((device) =>
                device.battery !== null
                    ? ` • ${device.name} (󰥉 ${device.battery}%)`
                    : ` • ${device.name}${device.mac ? ` (${device.mac})` : ""}`,
            ),
        ].join("\n")

        return {
            icon,
            label: icon,
            tooltip,
            connected,
        }
    } catch {
        return {
            icon: "",
            label: "",
            tooltip: "<b>Bluetooth</b>\n<tt>Device    Controller</tt>\n<tt>Connected 0 devices</tt>",
            connected: false,
        }
    }

}

export async function getPrivacyInfo(): Promise<PrivacyInfo> {
    const [micCountRaw, recorderRaw, videoRaw, directVideoRaw] = await Promise.all([
        sh("pactl list source-outputs short 2>/dev/null | wc -l"),
        sh("pgrep -f '^gpu-screen-recorder' >/dev/null && echo 1 || echo 0"),
        sh(String.raw`
            pw-dump 2>/dev/null | jq -r '
                def props: (.info.props // {});
                def textprops:
                    [
                        props["device.api"],
                        props["node.name"],
                        props["node.description"],
                        props["media.name"],
                        props["api.v4l2.path"],
                        props["object.path"]
                    ] | map(. // "") | join(" ");
                def link_output_id:
                    (
                        .info["output-node-id"]
                        // props["link.output.node"]
                        // props["output.node.id"]
                        // empty
                    ) | tostring;
                def video_node:
                    .type == "PipeWire:Interface:Node"
                    and ((props["media.class"] // "") | test("Video"));
                def active_node($activeVideoOutputs):
                    (.id | tostring) as $id
                    | (($activeVideoOutputs | index($id)) != null)
                    or ((.info.state // "") | test("running"; "i"));
                def camera_node($activeVideoOutputs):
                    video_node and active_node($activeVideoOutputs) and (textprops | test("v4l2|libcamera|camera|webcam|/dev/video"; "i"));
                def portal_node($activeVideoOutputs):
                    video_node and active_node($activeVideoOutputs) and (textprops | test("xdpw|portal|screencast|screen|hyprland"; "i"));

                [
                    .[]
                    | select(.type == "PipeWire:Interface:Link")
                    | select((.info.state // "active") | test("active|running"; "i"))
                    | link_output_id
                ] as $activeVideoOutputs
                |
                {
                    camera: any(.[]; camera_node($activeVideoOutputs)),
                    screen: any(.[]; portal_node($activeVideoOutputs))
                } | @json
            ' 2>/dev/null
        `),
        sh(String.raw`
            pw-dump 2>/dev/null | jq -r '
                [
                    .[]
                    | select(.type == "PipeWire:Interface:Node")
                    | (.info.props // {})["api.v4l2.path"]
                    | select(type == "string" and length > 0)
                ]
                | unique
                | .[]
            ' 2>/dev/null \
            | while IFS= read -r device; do
                [ -n "$device" ] || continue
                if fuser "$device" >/dev/null 2>&1; then
                    echo "$device"
                fi
            done
        `),
    ])

    const micActive = (Number.parseInt(micCountRaw.trim(), 10) || 0) > 0
    const video = parseJson<{ camera?: boolean; screen?: boolean }>(videoRaw.trim(), {})
    const directVideoActive = directVideoRaw.trim().length > 0
    const cameraActive = video.camera === true || directVideoActive
    const screenActive = recorderRaw.trim() === "1" || video.screen === true
    const icons = [
        micActive ? "" : "",
        cameraActive ? "" : "",
        screenActive ? "󰹑" : "",
    ].filter(Boolean)

    const details = [
        micActive ? "Microphone in use" : "",
        cameraActive ? "Camera in use" : "",
        screenActive ? "Screen capture active" : "",
    ].filter(Boolean)

    return {
        text: icons.join("  "),
        tooltip: details.length ? `<b>Privacy</b>\n${details.join("\n")}` : "<b>Privacy</b>\nNo active capture",
        micActive,
        cameraActive,
        screenActive,
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
    const percentText = `${String(capacity).padStart(2, "0")}%`
    const filled = Math.max(0, Math.min(8, Math.round(capacity / 12.5)))
    const bar = `${"●".repeat(filled)}${"·".repeat(8 - filled)}`
    const chargeLine = `<tt>${percentText}  ${bar}  ${status}</tt>`
    const detailLines = [
        wattsText ? `<tt>Power   ${wattsText}${status === "Charging" ? " ↑" : status === "Discharging" ? " ↓" : ""}</tt>` : "",
        health ? `<tt>Health  ${health}</tt>` : "",
        cycles ? `<tt>Cycles  ${cycles}</tt>` : "",
    ].filter(Boolean)
    const tooltip = [
        "<b>Battery</b>",
        chargeLine,
        "",
        ...detailLines,
    ].join("\n")

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
