import { Astal, Gdk, Gtk } from "ags/gtk4"
import App from "ags/gtk4/app"
import GLib from "gi://GLib?version=2.0"
import { moduleButton, moduleLabel, setWindowMargins, valueLabel } from "./widgets"

type CalendarPanelRefs = {
    window: Gtk.Window
    card: Gtk.Box
    title: Gtk.Label
    monthTitle: Gtk.Label
    todayText: Gtk.Label
    dayGrid: Gtk.Grid
    anchorButton?: Gtk.Widget
    shell?: Gtk.Widget
    monitorWidth?: number
    panelWidth?: number
    year: number
    month: number
}

const panels: CalendarPanelRefs[] = []
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

function clearGrid(grid: Gtk.Grid) {
    let child = grid.get_first_child()
    while (child) {
        const next = child.get_next_sibling()
        grid.remove(child)
        child = next
    }
}

function sameLocalDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function setMonth(panel: CalendarPanelRefs, year: number, month: number) {
    const anchor = new Date(year, month, 1)
    panel.year = anchor.getFullYear()
    panel.month = anchor.getMonth()
    renderCalendar(panel)
}

function addMonths(panel: CalendarPanelRefs, delta: number) {
    setMonth(panel, panel.year, panel.month + delta)
}

function renderCalendar(panel: CalendarPanelRefs) {
    const today = new Date()
    const first = new Date(panel.year, panel.month, 1)
    const start = new Date(panel.year, panel.month, 1 - first.getDay())

    panel.monthTitle.set_label(`${monthNames[panel.month]} ${panel.year}`)
    panel.todayText.set_label(`Today   ${weekdays[today.getDay()]}, ${monthNames[today.getMonth()].slice(0, 3)} ${today.getDate()}`)

    clearGrid(panel.dayGrid)

    weekdays.forEach((day, column) => {
        const label = valueLabel(day)
        label.add_css_class("calendar-weekday")
        label.set_xalign(0.5)
        panel.dayGrid.attach(label, column, 0, 1, 1)
    })

    for (let index = 0; index < 42; index += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
        const label = moduleLabel(String(date.getDate()))
        const button = moduleButton(["calendar-day"], label)
        button.set_focusable(false)
        button.set_can_focus(false)
        button.set_size_request(32, 28)

        if (date.getMonth() !== panel.month) button.add_css_class("outside")
        if (sameLocalDay(date, today)) button.add_css_class("today")

        panel.dayGrid.attach(button, index % 7, Math.floor(index / 7) + 1, 1, 1)
    }
}

function positionCalendarWindow(
    panel: CalendarPanelRefs,
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

export function closeCalendarWindow(panel: CalendarPanelRefs) {
    panel.window.set_visible(false)
    panel.window.set_keymode(Astal.Keymode.NONE)
}

function openCalendarWindow(
    panel: CalendarPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    panels.forEach((other) => {
        if (other !== panel && other.window.is_visible()) closeCalendarWindow(other)
    })

    const now = new Date()
    setMonth(panel, now.getFullYear(), now.getMonth())
    positionCalendarWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
    panel.window.set_visible(true)
    panel.window.present()
    panel.window.set_keymode(Astal.Keymode.ON_DEMAND)

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        panel.card.grab_focus()
        return GLib.SOURCE_REMOVE
    })
}

export function toggleCalendarWindow(
    panel: CalendarPanelRefs,
    anchorButton: Gtk.Widget,
    shell: Gtk.Widget,
    monitorWidth: number,
    panelWidth: number,
) {
    if (panel.window.is_visible()) {
        closeCalendarWindow(panel)
        return
    }

    openCalendarWindow(panel, anchorButton, shell, monitorWidth, panelWidth)
}

export function buildCalendarPanel(monitor: number, compactLayout: boolean, panelWidth: number): CalendarPanelRefs {
    const now = new Date()
    const title = valueLabel("Calendar")
    title.add_css_class("calendar-kicker")

    const monthTitle = valueLabel("")
    monthTitle.add_css_class("calendar-title")

    const todayText = valueLabel("")
    todayText.add_css_class("calendar-today")

    const headerText = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3 })
    headerText.append(title)
    headerText.append(monthTitle)

    const prevButton = moduleButton(["calendar-nav"], moduleLabel("<"), () => addMonths(panel, -1))
    const nextButton = moduleButton(["calendar-nav"], moduleLabel(">"), () => addMonths(panel, 1))
    const closeButton = moduleButton(["calendar-nav", "calendar-close"], moduleLabel("x"))

    const headerActions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    headerActions.append(prevButton)
    headerActions.append(nextButton)
    headerActions.append(closeButton)

    const header = new Gtk.CenterBox()
    header.add_css_class("calendar-header")
    header.set_start_widget(headerText)
    header.set_end_widget(headerActions)

    const dayGrid = new Gtk.Grid({
        column_homogeneous: true,
        row_homogeneous: true,
        column_spacing: 5,
        row_spacing: 5,
    })
    dayGrid.add_css_class("calendar-grid")

    const current = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    current.add_css_class("calendar-current")
    current.append(todayText)

    const monthCard = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })
    monthCard.add_css_class("calendar-month-card")
    monthCard.append(dayGrid)

    const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
    card.add_css_class("calendar-panel")
    card.set_size_request(panelWidth, -1)
    card.set_focusable(true)
    card.set_can_focus(true)
    card.append(header)
    card.append(current)
    card.append(monthCard)

    const window = new Astal.Window({
        application: App,
        name: `calendar-${monitor}`,
        monitor,
        anchor: Astal.WindowAnchor.TOP | Astal.WindowAnchor.LEFT,
        exclusivity: Astal.Exclusivity.IGNORE,
        keymode: Astal.Keymode.NONE,
        layer: Astal.Layer.OVERLAY,
        visible: false,
        child: card,
    })
    setWindowMargins(window, compactLayout ? 52 : 56, 0, 16)

    const panel: CalendarPanelRefs = {
        window,
        card,
        title,
        monthTitle,
        todayText,
        dayGrid,
        panelWidth,
        year: now.getFullYear(),
        month: now.getMonth(),
    }

    const escapeController = new Gtk.EventControllerKey()
    escapeController.connect("key-pressed", (_controller, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
            closeCalendarWindow(panel)
            return true
        }
        return false
    })
    card.add_controller(escapeController)

    closeButton.connect("clicked", () => closeCalendarWindow(panel))
    window.connect("close-request", () => {
        closeCalendarWindow(panel)
        return true
    })

    renderCalendar(panel)
    panels.push(panel)
    App.add_window(window)
    return panel
}
