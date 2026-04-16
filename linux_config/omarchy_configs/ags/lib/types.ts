import { Gtk } from "ags/gtk4"

export type Theme = Record<string, string>

export type BarRefs = {
    workspaceBox: Gtk.Box
    weather: Gtk.Label
    weatherButton: Gtk.Widget
    weatherPanel: WeatherPanelRefs
    clock: Gtk.Label
    indiaClock: Gtk.Label
    privacy: Gtk.Label
    privacyButton: Gtk.Button
    update: Gtk.Label
    updateButton: Gtk.Button
    voxtype: Gtk.Label
    voxtypeButton: Gtk.Button
    record: Gtk.Label
    recordButton: Gtk.Button
    idle: Gtk.Label
    idleButton: Gtk.Button
    notif: Gtk.Label
    notifButton: Gtk.Button
    bluetooth: Gtk.Label
    bluetoothButton: Gtk.Button
    network: Gtk.Label
    networkButton: Gtk.Button
    audio: Gtk.Label
    audioButton: Gtk.Button
    brightness: Gtk.Label
    brightnessButton: Gtk.Button
    cpu: Gtk.Label
    cpuButton: Gtk.Button
    memory: Gtk.Label
    memoryButton: Gtk.Button
    battery: Gtk.Label
    batteryButton: Gtk.Button
}

export type WeatherForecastItem = {
    label: string
    icon: string
    temp: string
    wind: string
    desc: string
}

export type WeatherData = {
    bar_text: string
    location: string
    icon: string
    temp_c: string
    feels_like_c: string
    wind_kmh: string
    condition: string
    local_time: string
    updated_at: string
    sunrise: string
    sunset: string
    forecast: WeatherForecastItem[]
    error?: string
}

export type WeatherPanelRefs = {
    popover: Gtk.Popover
    revealer: Gtk.Revealer
    card: Gtk.Box
    location: Gtk.Label
    currentIcon: Gtk.Label
    currentTemp: Gtk.Label
    currentCondition: Gtk.Label
    currentMeta: Gtk.Label
    currentCycle: Gtk.Label
    updatedAt: Gtk.Label
    forecastBox: Gtk.Box
}

export type BatteryInfo = {
    icon: string
    text: string
    tooltip: string
    levelClass: string
    value: number
    watts: string
    status: string
}

export type BrightnessInfo = {
    icon: string
    value: number
    text: string
    nightLight: boolean
}

export type AudioInfo = {
    icon: string
    value: number
    muted: boolean
    text: string
    tooltip: string
}

export type NetworkInfo = {
    icon: string
    label: string
    tooltip: string
    details: string
}

export type BluetoothInfo = {
    icon: string
    label: string
    tooltip: string
    connected: boolean
}

export type PrivacyInfo = {
    text: string
    tooltip: string
    micActive: boolean
    screenActive: boolean
}
