import { Astal, Gdk, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
import Pango from "gi://Pango?version=1.0"
import { compact } from "./helpers"
import { weatherFallbackData } from "./weather-model"
import type { BarRefs, WeatherCityData, WeatherData, WeatherPanelRefs } from "./types"
import { moduleButton, moduleLabel, setTooltip, setWindowMargins, valueLabel } from "./widgets"

type WeatherCardActions = {
    setPrimaryCity: (cityId: string) => void
    removeCity: (cityId: string) => void
}

type WeatherPanelCallbacks = {
    addCity: (panel: WeatherPanelRefs) => void
    refreshNow: () => void
}

type ForecastCardViewModel = WeatherCityData["forecast"][number]

type WeatherCityCardViewModel = WeatherCityData

type WeatherPanelViewModel = {
    title: string
    location: string
    currentIcon: string
    currentTemp: string
    currentCondition: string
    currentMeta: string
    currentCycle: string
    updatedAt: string
    message: string
    secondaryCities: WeatherCityCardViewModel[]
    forecast: ForecastCardViewModel[]
    error?: string
}

type WeatherViewModel = {
    barText: string
    tooltip: string
    panel: WeatherPanelViewModel
}

function clearBox(box: Gtk.Box) {
    let child = box.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        box.remove(child)
        child = next
    }
}

function setCompactLabel(label: Gtk.Label) {
    label.set_wrap(false)
    label.set_single_line_mode(true)
    label.set_ellipsize(Pango.EllipsizeMode.END)
}

function setPlainTooltip(widget: Gtk.Widget, text: string) {
    widget.set_tooltip_text(text || null)
}

function parseClockMinutes(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return null

    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) return null

    return hour * 60 + minute
}

function formatDaylightDuration(sunrise: string, sunset: string): string {
    const sunriseMinutes = parseClockMinutes(sunrise)
    const sunsetMinutes = parseClockMinutes(sunset)
    if (sunriseMinutes === null || sunsetMinutes === null || sunsetMinutes <= sunriseMinutes) return ""

    const totalMinutes = sunsetMinutes - sunriseMinutes
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `(${hours}h ${minutes.toString().padStart(2, "0")}m light)`
}

function buildForecastCard(item: ForecastCardViewModel) {
    const row = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, hexpand: true })
    row.add_css_class("forecast-row")
    row.set_size_request(0, 72)
    setPlainTooltip(row, `${item.label}  ${item.temp}\n${item.desc}\n󰖝 ${item.wind}`)

    const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const time = new Gtk.Label({ label: item.label, xalign: 0 })
    time.add_css_class("forecast-time")
    time.set_hexpand(true)
    const temp = new Gtk.Label({ label: item.temp, xalign: 1 })
    temp.add_css_class("forecast-temp")
    header.append(time)
    header.append(temp)

    const summary = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    summary.add_css_class("forecast-summary")
    const icon = new Gtk.Label({ label: item.icon })
    icon.add_css_class("forecast-icon")
    const desc = new Gtk.Label({ label: item.desc, xalign: 0 })
    desc.add_css_class("forecast-desc")
    desc.set_hexpand(true)
    setCompactLabel(desc)
    summary.append(icon)
    summary.append(desc)

    const meta = new Gtk.Label({ label: `󰖝 ${item.wind}`, xalign: 0 })
    meta.add_css_class("forecast-meta")

    row.append(header)
    row.append(summary)
    row.append(meta)
    return row
}

function buildWeatherCityCard(city: WeatherCityCardViewModel, actions: WeatherCardActions) {
    const button = new Gtk.Button({ hexpand: true })
    button.add_css_class("weather-city-card")
    if (city.is_primary) button.add_css_class("primary")
    if (city.is_auto) button.add_css_class("live")
    button.set_size_request(176, 92)
    button.connect("clicked", () => {
        actions.setPrimaryCity(city.id)
    })
    const updatedLabel = city.local_time || city.updated_at
    setPlainTooltip(
        button,
        [
            city.title,
            `${city.temp_c}  ${city.error ? "Unavailable" : city.condition}`,
            city.error ?? city.location,
            updatedLabel && !city.error ? `Updated at ${updatedLabel}` : "",
        ]
            .filter(Boolean)
            .join("\n"),
    )

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 5 })

    const top = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const title = new Gtk.Label({ label: city.title, xalign: 0 })
    title.add_css_class("weather-city-title")
    title.set_hexpand(true)
    setCompactLabel(title)
    top.append(title)

    const middle = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const icon = new Gtk.Label({ label: city.icon, xalign: 0 })
    icon.add_css_class("weather-city-icon")
    const summary = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true })
    const tempCondition = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const temp = new Gtk.Label({ label: city.temp_c, xalign: 0 })
    temp.add_css_class("weather-city-temp")
    const condition = new Gtk.Label({ label: city.error ? "Unavailable" : city.condition, xalign: 0 })
    condition.add_css_class("weather-city-condition")
    condition.set_hexpand(true)
    setCompactLabel(condition)
    const meta = new Gtk.Label({ label: city.error ?? city.location, xalign: 0 })
    meta.add_css_class("weather-city-meta")
    setCompactLabel(meta)
    const updated = new Gtk.Label({
        label: updatedLabel && !city.error ? `Updated at ${updatedLabel}` : "",
        xalign: 0,
    })
    updated.add_css_class("weather-city-updated")
    setCompactLabel(updated)
    updated.set_visible(Boolean(updatedLabel) && !city.error)
    tempCondition.append(temp)
    tempCondition.append(condition)
    summary.append(tempCondition)
    summary.append(meta)
    summary.append(updated)
    middle.append(icon)
    middle.append(summary)

    content.append(top)
    content.append(middle)

    button.set_child(content)

    const overlay = new Gtk.Overlay()
    overlay.add_css_class("weather-city-shell")
    overlay.set_size_request(176, 92)
    overlay.set_child(button)

    if (city.removable) {
        const removeLabel = moduleLabel("󰅖")
        const removeButton = moduleButton(["weather-city-remove"], removeLabel, () => {
            actions.removeCity(city.id)
        })
        removeButton.set_halign(Gtk.Align.END)
        removeButton.set_valign(Gtk.Align.START)
        overlay.add_overlay(removeButton)
    }

    return overlay
}

function bindVerticalScrollToHorizontal(scroller: Gtk.ScrolledWindow) {
    const controller = Gtk.EventControllerScroll.new(Gtk.EventControllerScrollFlags.VERTICAL)
    controller.connect("scroll", (_controller, _dx, dy) => {
        if (Math.abs(dy) < 0.02) return false

        const adjustment = scroller.get_hadjustment()
        const lower = adjustment.get_lower()
        const upper = adjustment.get_upper()
        const pageSize = adjustment.get_page_size()
        const max = Math.max(lower, upper - pageSize)
        const step = Math.max(adjustment.get_step_increment(), pageSize * 0.42, 96)
        const next = Math.max(lower, Math.min(max, adjustment.get_value() + dy * step))

        adjustment.set_value(next)
        return true
    })
    scroller.add_controller(controller)
}

function positionWeatherWindow(
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    let buttonX = 16
    let buttonY = 0

    try {
        const [ok, x, y] = anchorButton.translate_coordinates(shell, 0, 0)
        if (ok) {
            buttonX = Math.round(x)
            buttonY = Math.round(y)
        }
    } catch {}

    const shellWidth = shell.get_width() > 0 ? shell.get_width() : monitorWidth
    const width = Math.min(panelWidth, Math.max(280, shellWidth - 16))
    const buttonCenter = buttonX + Math.round(anchorButton.get_width() / 2)
    const maxLeft = Math.max(8, shellWidth - width - 8)
    const left = Math.max(8, Math.min(maxLeft, Math.round(buttonCenter - width / 2)))
    const top = Math.max(40, Math.round(buttonY + anchorButton.get_height() + 10))
    panel.window.set_default_size(width, 1)
    panel.card.set_size_request(width, -1)
    setWindowMargins(panel.window as Astal.Window, top, 0, left)
}

function openWeatherWindow(
    bars: BarRefs[],
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    bars.forEach((refs) => {
        if (refs.weather.weatherPanel !== panel && refs.weather.weatherPanel.window.is_visible()) {
            closeWeatherWindow(refs.weather.weatherPanel)
        }
    })

    positionWeatherWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
    panel.window.set_visible(true)
    panel.window.present()
    panel.window.set_keymode(Astal.Keymode.ON_DEMAND)
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        if (panel.addRevealer.get_reveal_child()) panel.addEntry.grab_focus_without_selecting()
        else panel.card.grab_focus()
        return GLib.SOURCE_REMOVE
    })
}

function weatherViewModel(data: WeatherData): WeatherViewModel {
    const current = data.primary_city ?? weatherFallbackData().primary_city
    const barText = compact(data.bar_text ?? "󰖪 --")
    const cityCount = data.cities?.length ?? 0
    const secondaryCities = (data.cities ?? []).filter((city) => !city.is_primary)
    const daylight = formatDaylightDuration(current.sunrise, current.sunset)
    const currentCycle = [
        current.sunrise ? `󰖜 ${current.sunrise}` : "",
        current.sunset ? `󰖛 ${current.sunset}` : "",
        daylight,
    ]
        .filter(Boolean)
        .join("   ")
    const updatedLabel = current.local_time || current.updated_at
    const message = data.notice ?? (data.error ? data.error : "")
    const tooltip = [
        `<b>${current.title}</b>`,
        `<tt>${barText}</tt>`,
        cityCount > 1 ? `${cityCount} saved cities` : "1 saved city",
        cityCount > 1 ? "Click to open • Scroll to switch cities" : "Click to open",
    ].join("\n")

    return {
        barText,
        tooltip,
        panel: {
            title: current.title,
            location: current.location,
            currentIcon: current.icon,
            currentTemp: current.temp_c,
            currentCondition: current.condition,
            currentMeta: `Feels like ${current.feels_like_c}   •   󰖝 ${current.wind_kmh}`,
            currentCycle,
            updatedAt: updatedLabel ? `Updated at ${updatedLabel}` : "Updated at just now",
            message,
            secondaryCities,
            forecast: current.forecast.slice(0, 4),
            error: current.error,
        },
    }
}

function applyWeatherViewModel(panel: WeatherPanelRefs, viewModel: WeatherPanelViewModel, actions: WeatherCardActions) {
    panel.title.set_label(viewModel.title)
    panel.location.set_label(viewModel.location)
    panel.currentIcon.set_label(viewModel.currentIcon)
    panel.currentTemp.set_label(viewModel.currentTemp)
    panel.currentCondition.set_label(viewModel.currentCondition)
    panel.currentMeta.set_label(viewModel.currentMeta)
    panel.currentCycle.set_label(viewModel.currentCycle)
    panel.currentCycle.set_visible(Boolean(viewModel.currentCycle))
    panel.updatedAt.set_label(viewModel.updatedAt)

    panel.message.set_label(viewModel.message)
    panel.message.set_visible(Boolean(viewModel.message))

    clearBox(panel.cityList)
    viewModel.secondaryCities.forEach((city) => {
        panel.cityList.append(buildWeatherCityCard(city, actions))
    })
    panel.cityCards.set_visible(viewModel.secondaryCities.length > 0)

    clearBox(panel.forecastBox)
    if (viewModel.error) {
        const error = valueLabel(viewModel.error)
        error.add_css_class("weather-meta")
        panel.forecastBox.append(error)
        return
    }

    viewModel.forecast.forEach((item) => {
        panel.forecastBox.append(buildForecastCard(item))
    })
}

export function applyWeatherData(
    bars: BarRefs[],
    data: WeatherData,
    actions: WeatherCardActions,
) {
    const viewModel = weatherViewModel(data)

    for (const refs of bars) {
        refs.weather.weather.set_label(viewModel.barText)
        setTooltip(refs.weather.weatherButton, viewModel.tooltip)
    }

    for (const refs of bars) {
        applyWeatherViewModel(refs.weather.weatherPanel, viewModel.panel, actions)
    }
}

export function closeWeatherWindow(panel: WeatherPanelRefs) {
    panel.addEntry.set_text("")
    panel.addRevealer.set_reveal_child(false)
    panel.addTriggerLabel.set_label("󰐕")
    panel.addTrigger.set_visible(false)
    panel.window.set_visible(false)
    panel.window.set_keymode(Astal.Keymode.NONE)
}

export function scheduleWeatherPanelRelayout(panel: WeatherPanelRefs) {
    if (!panel.window.is_visible()) return
    const anchorButton = panel.anchorButton
    const shell = panel.shell
    const monitorWidth = panel.monitorWidth
    const panelWidth = panel.panelWidth
    if (!anchorButton || !shell || !monitorWidth || !panelWidth) return

    ;[0, 120, 240].forEach((delay) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            if (!panel.window.is_visible()) return GLib.SOURCE_REMOVE
            panel.window.set_default_size(panelWidth, 1)
            panel.card.queue_resize()
            panel.window.queue_resize()
            positionWeatherWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
            return GLib.SOURCE_REMOVE
        })
    })
}

export function toggleWeatherWindow(
    bars: BarRefs[],
    panel: WeatherPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    if (panel.window.is_visible()) {
        closeWeatherWindow(panel)
        return
    }

    openWeatherWindow(bars, panel, anchorButton, shell, monitorWidth, panelWidth)
}

export function buildWeatherPanel(
    monitor: number,
    compactLayout: boolean,
    panelWidth: number,
    callbacks: WeatherPanelCallbacks,
): WeatherPanelRefs {
    const title = valueLabel("Weather")
    title.add_css_class("weather-kicker")

    const location = valueLabel("Current Location")
    location.add_css_class("weather-location")

    const headerText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 })
    headerText.append(title)
    headerText.append(location)

    const refreshIcon = moduleLabel("󰑐")
    const refreshButton = moduleButton(["weather-refresh"], refreshIcon, () => {
        callbacks.refreshNow()
    })
    const closeIcon = moduleLabel("󰅖")
    const closeButton = moduleButton(["weather-refresh", "weather-close"], closeIcon)

    const headerActions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    headerActions.append(refreshButton)
    headerActions.append(closeButton)

    const header = new Gtk.CenterBox()
    header.add_css_class("weather-header")
    header.set_start_widget(headerText)
    header.set_end_widget(headerActions)

    const addEntry = new Gtk.Entry({ hexpand: true, placeholder_text: "Add a city" })
    addEntry.add_css_class("weather-entry")
    addEntry.set_focusable(true)
    addEntry.set_can_focus(true)
    const addIcon = moduleLabel("󰐕")
    const addButton = moduleButton(["weather-add"], addIcon)

    const addRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    addRow.add_css_class("weather-add-row")
    addRow.append(addEntry)
    addRow.append(addButton)

    const addRevealer = new Gtk.Revealer({
        transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
        reveal_child: false,
        child: addRow,
    })
    addRevealer.add_css_class("weather-add-revealer")

    const message = valueLabel("")
    message.add_css_class("weather-message")
    message.set_visible(false)

    const currentIcon = new Gtk.Label({ label: "☁️" })
    currentIcon.add_css_class("weather-hero-icon")
    const currentTemp = valueLabel("--")
    currentTemp.add_css_class("weather-temp")
    setCompactLabel(currentTemp)
    const currentCondition = valueLabel("Loading…")
    currentCondition.add_css_class("weather-condition")
    setCompactLabel(currentCondition)
    const currentMeta = valueLabel("")
    currentMeta.add_css_class("weather-meta")
    setCompactLabel(currentMeta)
    const currentCycle = valueLabel("")
    currentCycle.add_css_class("weather-cycle")
    setCompactLabel(currentCycle)
    const updatedAt = valueLabel("")
    updatedAt.add_css_class("weather-updated")
    setCompactLabel(updatedAt)

    const currentHeadline = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    currentHeadline.append(currentTemp)
    currentHeadline.append(currentCondition)

    const currentText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true })
    currentText.append(currentHeadline)
    currentText.append(currentMeta)
    currentText.append(currentCycle)
    currentText.append(updatedAt)

    const current = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    current.add_css_class("weather-current")
    current.append(currentIcon)
    current.append(currentText)

    const cityHeader = valueLabel("Elsewhere")
    cityHeader.add_css_class("weather-forecast-header")
    const addTriggerLabel = moduleLabel("󰐕")
    const addTrigger = moduleButton(["weather-add-trigger"], addTriggerLabel)
    addTrigger.set_visible(false)
    const cityHeaderBar = new Gtk.CenterBox()
    cityHeaderBar.add_css_class("weather-section-bar")
    cityHeaderBar.set_start_widget(cityHeader)
    cityHeaderBar.set_end_widget(addTrigger)

    const cityList = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    cityList.add_css_class("weather-city-list")

    const cityScroller = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.NEVER,
        propagate_natural_width: false,
    })
    cityScroller.add_css_class("weather-city-scroller")
    cityScroller.set_min_content_height(102)
    cityScroller.set_max_content_height(116)
    cityScroller.set_min_content_width(panelWidth - 24)
    cityScroller.set_max_content_width(panelWidth - 24)
    cityScroller.set_hexpand(true)
    cityScroller.set_child(cityList)
    bindVerticalScrollToHorizontal(cityScroller)

    const cityCards = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    cityCards.set_visible(false)
    cityCards.append(cityScroller)

    const cityWrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    cityWrap.add_css_class("weather-city-section")
    cityWrap.append(cityHeaderBar)
    cityWrap.append(addRevealer)
    cityWrap.append(message)
    cityWrap.append(cityCards)

    const forecastHeader = valueLabel("Ahead")
    forecastHeader.add_css_class("weather-forecast-header")
    const forecastBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    forecastBox.set_homogeneous(true)

    const forecastWrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 })
    forecastWrap.add_css_class("weather-forecast")
    forecastWrap.append(forecastHeader)
    forecastWrap.append(forecastBox)

    const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    card.add_css_class("weather-panel")
    card.set_size_request(panelWidth, -1)
    card.set_focusable(true)
    card.set_can_focus(true)
    card.append(header)
    card.append(current)
    card.append(cityWrap)
    card.append(forecastWrap)

    const window = new Astal.Window({
        application: App,
        name: `weather-${monitor}`,
        monitor,
        anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT,
        exclusivity: Astal.Exclusivity.IGNORE,
        keymode: Astal.Keymode.NONE,
        layer: Astal.Layer.OVERLAY,
        visible: false,
        child: card,
    })
    setWindowMargins(window, compactLayout ? 52 : 56, 0, 16)

    const panel: WeatherPanelRefs = {
        window,
        card,
        citySection: cityWrap,
        cityCards,
        title,
        location,
        addEntry,
        addRevealer,
        addTrigger,
        addTriggerLabel,
        message,
        currentIcon,
        currentTemp,
        currentCondition,
        currentMeta,
        currentCycle,
        updatedAt,
        cityList,
        forecastBox,
    }

    const bindEscapeController = (widget: Gtk.Widget) => {
        const controller = new Gtk.EventControllerKey()
        controller.connect("key-pressed", (_controller, keyval) => {
            if (keyval === Gdk.KEY_Escape) {
                closeWeatherWindow(panel)
                return true
            }
            return false
        })
        widget.add_controller(controller)
    }

    bindEscapeController(window)
    bindEscapeController(card)
    bindEscapeController(addEntry)

    window.connect("close-request", () => {
        closeWeatherWindow(panel)
        return true
    })
    App.add_window(window)

    let addHeaderHovered = false
    const syncAddTrigger = () => {
        const expanded = addRevealer.get_reveal_child()
        addTriggerLabel.set_label(expanded ? "󰅖" : "󰐕")
        addTrigger.set_visible(addHeaderHovered || expanded)
    }

    addButton.connect("clicked", () => {
        callbacks.addCity(panel)
    })
    addTrigger.connect("clicked", () => {
        const expanded = !addRevealer.get_reveal_child()
        addRevealer.set_reveal_child(expanded)
        if (!expanded) addEntry.set_text("")
        syncAddTrigger()
        scheduleWeatherPanelRelayout(panel)
        if (expanded) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                addEntry.grab_focus_without_selecting()
                return GLib.SOURCE_REMOVE
            })
        }
    })
    closeButton.connect("clicked", () => {
        closeWeatherWindow(panel)
    })
    addEntry.connect("activate", () => {
        callbacks.addCity(panel)
    })

    const cityHeaderMotion = new Gtk.EventControllerMotion()
    cityHeaderMotion.connect("enter", () => {
        addHeaderHovered = true
        syncAddTrigger()
    })
    cityHeaderMotion.connect("leave", () => {
        addHeaderHovered = false
        syncAddTrigger()
    })
    cityHeaderBar.add_controller(cityHeaderMotion)
    addRevealer.connect("notify::child-revealed", () => {
        scheduleWeatherPanelRelayout(panel)
    })
    syncAddTrigger()

    return panel
}
