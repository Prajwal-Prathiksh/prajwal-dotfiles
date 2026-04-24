import type { WeatherCityData, WeatherData } from "./types"

export function weatherFallbackData(): WeatherData {
    const primaryCity: WeatherCityData = {
        id: "auto",
        query: "auto",
        title: "Current Location",
        location: "Weather unavailable",
        icon: "󰖪",
        temp_c: "--",
        feels_like_c: "--",
        wind_kmh: "--",
        condition: "Offline",
        local_time: "",
        updated_at: "Unavailable",
        sunrise: "",
        sunset: "",
        forecast: [],
        bar_text: "󰖪 --",
        removable: false,
        is_auto: true,
        is_primary: true,
        error: "Check network or wttr.in availability.",
    }

    return {
        bar_text: primaryCity.bar_text,
        primary_city: primaryCity,
        cities: [primaryCity],
        error: primaryCity.error,
    }
}

export function parseWeatherData(raw: string): WeatherData {
    try {
        return JSON.parse(raw) as WeatherData
    } catch {
        return weatherFallbackData()
    }
}

export function withPrimaryWeatherCity(data: WeatherData, cityId: string): WeatherData {
    const cities = (data.cities ?? []).map((city) => ({
        ...city,
        is_primary: city.id === cityId,
    }))
    const primary = cities.find((city) => city.id === cityId) ?? cities[0] ?? data.primary_city
    return {
        ...data,
        bar_text: primary?.bar_text ?? data.bar_text,
        primary_city: primary
            ? {
                ...primary,
                is_primary: true,
            }
            : data.primary_city,
        cities,
        notice: undefined,
    }
}
