import { readFile } from "ags/file"
import { execAsync } from "ags/process"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

export function safeRead(path: string, fallback = ""): string {
    try {
        return readFile(path).trim()
    } catch {
        return fallback
    }
}

export async function run(cmd: string[]): Promise<string> {
    try {
        return (await execAsync(cmd)).trim()
    } catch {
        return ""
    }
}

export async function sh(command: string): Promise<string> {
    return run(["bash", "-lc", command])
}

export function spawn(cmd: string[]) {
    try {
        Gio.Subprocess.new(cmd, Gio.SubprocessFlags.NONE)
    } catch (error) {
        console.error(error)
    }
}

export function poll(interval: number, fn: () => void | Promise<void>) {
    void fn()
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
        void fn()
        return GLib.SOURCE_CONTINUE
    })
}

export function parseJson<T>(raw: string, fallback: T): T {
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

export function compact(text: string) {
    return text.replace(/\s+/g, " ").trim()
}

export function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace("#", "")
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean
    const r = Number.parseInt(full.slice(0, 2), 16)
    const g = Number.parseInt(full.slice(2, 4), 16)
    const b = Number.parseInt(full.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
