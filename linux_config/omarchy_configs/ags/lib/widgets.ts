import { Astal, Gdk, Gtk } from "ags/gtk4"

export function addRightClick(widget: Gtk.Widget, callback: () => void) {
    const gesture = Gtk.GestureClick.new()
    gesture.set_button(Gdk.BUTTON_SECONDARY)
    gesture.connect("pressed", () => callback())
    widget.add_controller(gesture)
}

export function addScroll(widget: Gtk.Widget, onUp: () => void, onDown: () => void) {
    const controller = Gtk.EventControllerScroll.new(Gtk.EventControllerScrollFlags.VERTICAL)
    controller.connect("scroll", (_controller, _dx, dy) => {
        if (dy < 0) onUp()
        if (dy > 0) onDown()
        return true
    })
    widget.add_controller(controller)
}

export function setTooltip(widget: Gtk.Widget, text: string) {
    widget.set_tooltip_markup(text || null)
}

export function togglePopover(popover: Gtk.Popover) {
    if (popover.is_visible()) popover.popdown()
    else popover.popup()
}

export function moduleLabel(initial = ""): Gtk.Label {
    const label = new Gtk.Label({
        label: initial,
        xalign: 0.5,
        yalign: 0.5,
    })
    label.add_css_class("module-label")
    return label
}

export function moduleButton(
    classes: string[],
    label: Gtk.Label,
    onClick?: () => void,
): Gtk.Button {
    const button = new Gtk.Button()
    button.set_focusable(false)
    button.set_can_focus(false)
    button.add_css_class("module-button")
    classes.forEach((cls) => button.add_css_class(cls))
    button.set_child(label)
    if (onClick) button.connect("clicked", () => onClick())
    return button
}

export function workspaceButton(id: number, onClick: () => void): { button: Gtk.Button; label: Gtk.Label } {
    const label = moduleLabel(id === 10 ? "0" : String(id))
    const button = moduleButton(["workspace-button"], label, onClick)
    return { button, label }
}

export function capsule(classes: string[]): Gtk.Box {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 })
    box.add_css_class("capsule")
    classes.forEach((cls) => box.add_css_class(cls))
    return box
}

export function setWindowMargins(window: Astal.Window, top: number, right: number, left = 0) {
    window.set_property("margin-top", top)
    window.set_property("margin-right", right)
    window.set_property("margin-left", left)
}

export function valueLabel(text = ""): Gtk.Label {
    const label = new Gtk.Label({ label: text, xalign: 0 })
    label.add_css_class("value-text")
    return label
}

export function controlTile(
    icon: string,
    title: string,
    valueText: Gtk.Label,
    onClick: () => void,
): Gtk.Button {
    const titleLabel = new Gtk.Label({ label: title, xalign: 0 })
    titleLabel.add_css_class("tile-title")
    valueText.set_xalign(0)
    valueText.add_css_class("tile-value")

    const iconLabel = new Gtk.Label({ label: icon })
    iconLabel.add_css_class("tile-icon")

    const textBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3, hexpand: true })
    textBox.append(titleLabel)
    textBox.append(valueText)

    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    row.append(iconLabel)
    row.append(textBox)

    const button = new Gtk.Button()
    button.add_css_class("control-tile")
    button.set_child(row)
    button.connect("clicked", () => onClick())
    return button
}
