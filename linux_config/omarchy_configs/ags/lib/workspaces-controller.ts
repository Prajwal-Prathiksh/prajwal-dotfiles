import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { HOME } from "./paths"
import type { BarRefs } from "./types"
import { parseJson, run, spawn } from "./helpers"
import { workspaceButton } from "./widgets"

export type WorkspacesController = {
    connectEvents: () => void
    update: () => Promise<void>
}

export function createWorkspacesController(bars: BarRefs[]): WorkspacesController {
    let hyprSocketStream: Gio.DataInputStream | null = null
    let monitorRefreshTimer = 0

    function scheduleBarRestart() {
        if (monitorRefreshTimer) return
        monitorRefreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            spawn([`${HOME}/.config/ags/restart.sh`])
            monitorRefreshTimer = 0
            return GLib.SOURCE_REMOVE
        })
    }

    async function update() {
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
            let child = refs.workspaces.workspaceBox.get_first_child()
            while (child) {
                const next = child.get_next_sibling()
                refs.workspaces.workspaceBox.remove(child)
                child = next
            }

            visible.forEach((id) => {
                const { button } = workspaceButton(id, () =>
                    spawn(["hyprctl", "dispatch", "workspace", String(id)]),
                )
                if (id === active) button.add_css_class("active")
                refs.workspaces.workspaceBox.append(button)
            })
        }
    }

    function connectEvents() {
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
                                    connectEvents()
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
                                void update()
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
                                connectEvents()
                                return GLib.SOURCE_REMOVE
                            })
                        }
                    })
                }

                readNext()
            } catch {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    connectEvents()
                    return GLib.SOURCE_REMOVE
                })
            }
        })
    }

    return {
        connectEvents,
        update,
    }
}
