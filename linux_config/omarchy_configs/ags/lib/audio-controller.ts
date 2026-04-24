import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { AUDIO_OSD_SCRIPT } from "./paths"
import { getAudioInfo } from "./system-info"
import type { BarRefs } from "./types"
import { setTooltip } from "./widgets"
import { spawn } from "./helpers"

export type AudioController = {
    connectEvents: () => void
    update: () => Promise<void>
    toggleMute: () => void
    scroll: (delta: number) => void
}

export function createAudioController(bars: BarRefs[]): AudioController {
    let subscribeProcess: Gio.Subprocess | null = null
    let subscribeStream: Gio.DataInputStream | null = null
    let refreshTimer = 0
    let pendingScrollDelta = 0
    let scrollFlushTimer = 0

    function scheduleRefresh() {
        if (refreshTimer) GLib.source_remove(refreshTimer)
        refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            void update()
            refreshTimer = 0
            return GLib.SOURCE_REMOVE
        })
    }

    function scheduleRefreshBurst() {
        scheduleRefresh()
        const delays = [160, 360]
        delays.forEach((delay) => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                scheduleRefresh()
                return GLib.SOURCE_REMOVE
            })
        })
    }

    function adjustWithOsd(action: "raise" | "lower" | "mute-toggle", step?: number) {
        const cmd = [AUDIO_OSD_SCRIPT, action]
        if (typeof step === "number") cmd.push(String(step))
        spawn(cmd)
    }

    function scroll(delta: number) {
        pendingScrollDelta += delta
        if (scrollFlushTimer) return

        scrollFlushTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 24, () => {
            const totalDelta = pendingScrollDelta
            pendingScrollDelta = 0
            scrollFlushTimer = 0

            if (totalDelta > 0) adjustWithOsd("raise", totalDelta * 2)
            else if (totalDelta < 0) adjustWithOsd("lower", Math.abs(totalDelta) * 2)

            scheduleRefreshBurst()
            return GLib.SOURCE_REMOVE
        })
    }

    function toggleMute() {
        adjustWithOsd("mute-toggle")
        scheduleRefreshBurst()
    }

    function connectEvents() {
        try {
            const process = Gio.Subprocess.new(
                ["bash", "-lc", "pactl subscribe 2>/dev/null"],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            )
            const stdout = process.get_stdout_pipe()
            if (!stdout) return

            const stream = new Gio.DataInputStream({ base_stream: stdout })
            subscribeProcess = process
            subscribeStream = stream

            const readNext = () => {
                stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_stream, res) => {
                    try {
                        const [line] = stream.read_line_finish_utf8(res)
                        if (line === null) {
                            subscribeProcess = null
                            subscribeStream = null
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                                connectEvents()
                                return GLib.SOURCE_REMOVE
                            })
                            return
                        }

                        if (
                            line.includes("on sink") ||
                            line.includes("on server") ||
                            line.includes("on sink-input")
                        ) {
                            scheduleRefresh()
                        }

                        readNext()
                    } catch {
                        subscribeProcess = null
                        subscribeStream = null
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                            connectEvents()
                            return GLib.SOURCE_REMOVE
                        })
                    }
                })
            }

            readNext()
        } catch {}
    }

    async function update() {
        const info = await getAudioInfo()
        for (const refs of bars) {
            refs.connectivity.audio.set_label(info.text)
            refs.connectivity.audioButton.remove_css_class("muted")
            if (info.muted) refs.connectivity.audioButton.add_css_class("muted")
            setTooltip(refs.connectivity.audioButton, info.tooltip)
        }
    }

    return {
        connectEvents,
        update,
        toggleMute,
        scroll,
    }
}
