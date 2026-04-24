import { Astal, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
import { indiaClockText, localClockText } from "./system-info"
import type {
    BarRefs,
    ClockRefs,
    ConnectivityRefs,
    MetricRefs,
    StatusRefs,
    WeatherPanelRefs,
    WeatherRefs,
    WorkspaceRefs,
} from "./types"
import { buildCalendarPanel, toggleCalendarWindow } from "./calendar-view"
import { buildWeatherPanel, toggleWeatherWindow } from "./weather-view"
import { addRightClick, addScroll, capsule, moduleButton, moduleLabel, setTooltip, setWindowMargins } from "./widgets"
import { spawn } from "./helpers"

type BarLayoutInfo = {
    monitor: number
    monitorWidth: number
    compactLayout: boolean
    weatherPanelWidth: number
}

export type BarCallbacks = {
    addWeatherCity: (panel: WeatherPanelRefs) => void
    refreshWeatherNow: () => void
    handleWeatherScroll: (direction: "next" | "prev") => void
    toggleRecording: () => void
    toggleAudioMute: () => void
    scrollAudio: (delta: number) => void
    toggleNightLight: () => void
    scrollBrightness: (direction: "up" | "down") => void
}

type LeftBarParts = {
    capsule: Gtk.Box
    workspaces: WorkspaceRefs
}

type CenterBarParts = {
    capsule: Gtk.Box
    weather: WeatherRefs
    clocks: ClockRefs
    status: StatusRefs
}

type RightBarParts = {
    capsule: Gtk.Box
    connectivity: ConnectivityRefs
    metrics: MetricRefs
}

function barMonitorName(monitor: number): string {
    const monitorInfo = App.get_monitors()[monitor] as
        | ({ get_connector?: () => string | null; connector?: string | null })
        | undefined
    return monitorInfo?.get_connector?.() ?? monitorInfo?.connector ?? ""
}

function getBarLayoutInfo(monitor: number): BarLayoutInfo {
    const monitorInfo = App.get_monitors()[monitor]
    const geometry = monitorInfo?.get_geometry()
    const monitorWidth = geometry?.width ?? 1920
    const monitorHeight = geometry?.height ?? 1080
    const compactLayout = monitorWidth < 1500 || monitorHeight > monitorWidth
    return {
        monitor,
        monitorWidth,
        compactLayout,
        weatherPanelWidth: compactLayout ? Math.min(360, monitorWidth - 20) : 392,
    }
}

function buildLeftModules(compactLayout: boolean): LeftBarParts {
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

    return {
        capsule: leftCapsule,
        workspaces: { workspaceBox },
    }
}

function buildCenterModules(
    layout: BarLayoutInfo,
    shell: Gtk.Widget,
    bars: BarRefs[],
    callbacks: BarCallbacks,
): CenterBarParts {
    const weather = moduleLabel("󰖪 --")
    const weatherButton = moduleButton(["weather"], weather)
    const weatherPanel = buildWeatherPanel(layout.monitor, layout.compactLayout, layout.weatherPanelWidth, {
        addCity: callbacks.addWeatherCity,
        refreshNow: callbacks.refreshWeatherNow,
    })
    weatherPanel.anchorButton = weatherButton
    weatherPanel.shell = shell
    weatherPanel.monitorWidth = layout.monitorWidth
    weatherPanel.panelWidth = layout.weatherPanelWidth
    weatherButton.connect("clicked", () => {
        toggleWeatherWindow(
            bars,
            weatherPanel,
            weatherButton,
            shell,
            layout.monitorWidth,
            layout.weatherPanelWidth,
        )
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

        callbacks.handleWeatherScroll(weatherScrollAccum < 0 ? "next" : "prev")
        weatherScrollAccum = 0
        return true
    })
    weatherButton.add_controller(weatherScrollController)

    const clock = moduleLabel(localClockText())
    const clockButton = moduleButton(["clock"], clock)
    const calendarPanelWidth = layout.compactLayout ? Math.min(312, layout.monitorWidth - 20) : 320
    const calendarPanel = buildCalendarPanel(layout.monitor, layout.compactLayout, calendarPanelWidth)
    calendarPanel.anchorButton = clockButton
    calendarPanel.shell = shell
    calendarPanel.monitorWidth = layout.monitorWidth
    calendarPanel.panelWidth = calendarPanelWidth
    clockButton.connect("clicked", () => {
        toggleCalendarWindow(calendarPanel, clockButton, shell, layout.monitorWidth, calendarPanelWidth)
    })
    addRightClick(clockButton, () => spawn(["omarchy-launch-floating-terminal-with-presentation", "omarchy-tz-select"]))

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
    const recordButton = moduleButton(["status-indicator"], record, callbacks.toggleRecording)

    const idle = moduleLabel("")
    const idleButton = moduleButton(["status-indicator"], idle, () => spawn(["omarchy-toggle-idle"]))

    const notif = moduleLabel("")
    const notifButton = moduleButton(["status-indicator"], notif, () => spawn(["omarchy-toggle-notification-silencing"]))

    const centerCapsule = capsule(["center-capsule"])
    centerCapsule.set_spacing(layout.compactLayout ? 3 : 4)
    const centerWidgets = [weatherButton, clockButton, indiaButton, privacyButton, updateButton, voxtypeButton, recordButton, idleButton, notifButton]
    centerWidgets.forEach((widget) => centerCapsule.append(widget))

    return {
        capsule: centerCapsule,
        weather: { weather, weatherButton, weatherPanel },
        clocks: { clock, clockButton, indiaClock },
        status: {
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
        },
    }
}

function buildRightModules(compactLayout: boolean, callbacks: BarCallbacks): RightBarParts {
    const bluetooth = moduleLabel("")
    const bluetoothButton = moduleButton(["compact"], bluetooth, () => spawn(["omarchy-launch-bluetooth"]))

    const network = moduleLabel("󰤮")
    const networkButton = moduleButton(["compact"], network, () => spawn(["omarchy-launch-wifi"]))

    const audio = moduleLabel("󰕿")
    const audioButton = moduleButton(["compact", "audio"], audio, () => spawn(["omarchy-launch-audio"]))
    addRightClick(audioButton, callbacks.toggleAudioMute)
    addScroll(
        audioButton,
        () => {
            callbacks.scrollAudio(1)
        },
        () => {
            callbacks.scrollAudio(-1)
        },
    )

    const brightness = moduleLabel("󰃟 0%")
    const brightnessButton = moduleButton(["compact", "brightness"], brightness, callbacks.toggleNightLight)
    addScroll(
        brightnessButton,
        () => {
            callbacks.scrollBrightness("up")
        },
        () => {
            callbacks.scrollBrightness("down")
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
    const rightWidgets = [bluetoothButton, networkButton, audioButton, brightnessButton, cpuButton, memoryButton, batteryButton]
    rightWidgets.forEach((widget) => rightCapsule.append(widget))

    return {
        capsule: rightCapsule,
        connectivity: {
            bluetooth,
            bluetoothButton,
            network,
            networkButton,
            audio,
            audioButton,
            brightness,
            brightnessButton,
        },
        metrics: {
            cpu,
            cpuButton,
            memory,
            memoryButton,
            battery,
            batteryButton,
        },
    }
}

function buildBarRoot(
    compactLayout: boolean,
    leftCapsule: Gtk.Widget,
    centerCapsule: Gtk.Widget,
    rightCapsule: Gtk.Widget,
): Gtk.Widget {
    if (compactLayout) {
        const compactRoot = new Gtk.CenterBox({ hexpand: true })
        compactRoot.add_css_class("bar-root")
        compactRoot.set_start_widget(leftCapsule)
        compactRoot.set_center_widget(centerCapsule)
        compactRoot.set_end_widget(rightCapsule)
        return compactRoot
    }

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
    return overlayRoot
}

export function buildBar(monitor: number, bars: BarRefs[], callbacks: BarCallbacks): Astal.Window {
    const layout = getBarLayoutInfo(monitor)
    const shell = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true })
    shell.add_css_class("bar-shell")
    if (layout.compactLayout) shell.add_css_class("compact-monitor")

    const left = buildLeftModules(layout.compactLayout)
    const center = buildCenterModules(layout, shell, bars, callbacks)
    const right = buildRightModules(layout.compactLayout, callbacks)
    const root = buildBarRoot(layout.compactLayout, left.capsule, center.capsule, right.capsule)
    shell.append(root)

    const refs: BarRefs = {
        monitor,
        monitorName: barMonitorName(monitor),
        workspaces: left.workspaces,
        weather: center.weather,
        clocks: center.clocks,
        status: center.status,
        connectivity: right.connectivity,
        metrics: right.metrics,
    }
    bars.push(refs)

    const window = new Astal.Window({
        application: App,
        name: `bar-${monitor}`,
        monitor: layout.monitor,
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
