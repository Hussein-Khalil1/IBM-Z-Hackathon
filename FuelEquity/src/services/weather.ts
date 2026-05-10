/**
 * Weather Service (S3-06)
 * Fetches weather data from OpenWeatherMap API.
 * Returns temperature, wind speed, wind direction for fuel consumption calculations.
 */

interface WeatherData {
  temperature: number; // Celsius
  weatherDescription: string;
  windSpeedKmh: number;
  windDirection: number; // 0-360 degrees
  humidity: number; // 0-100%
  visibility: number; // km
  pressure: number; // hPa
  feelsLike: number; // Celsius (wind chill)
  cloudCover: number; // 0-100%
  location: {
    lat: number;
    lon: number;
    name: string;
  };
  fetchedAt: number; // timestamp
}

interface WeatherForecast extends WeatherData {
  forecastTime: number; // timestamp when this forecast is for
  rainfall: number; // mm
  snowfall: number; // mm
}

/**
 * Fetch current weather for a given location.
 * Uses OpenWeatherMap API (free tier).
 * Results cached for 30 minutes.
 */
export async function getWeather(
  latitude: number,
  longitude: number,
  apiKey?: string,
): Promise<WeatherData> {
  if (!apiKey) {
    console.warn('OpenWeatherMap API key not provided, returning mock weather');
    return getMockWeather(latitude, longitude);
  }

  const cacheKey = `weather_${Math.round(latitude * 100) / 100}_${Math.round(longitude * 100) / 100}`;
  const cached = localStorage?.getItem(cacheKey);

  if (cached) {
    const data = JSON.parse(cached);
    const age = Date.now() - data.fetchedAt;
    if (age < 30 * 60 * 1000) {
      // Cache valid for 30 mins
      return data;
    }
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.statusText}`);
    }

    const data = await response.json();

    const weather: WeatherData = {
      temperature: data.main.temp,
      weatherDescription: data.weather[0].description,
      windSpeedKmh: (data.wind.speed || 0) * 3.6, // Convert m/s to km/h
      windDirection: data.wind.deg || 0,
      humidity: data.main.humidity,
      visibility: (data.visibility || 10000) / 1000, // Convert m to km
      pressure: data.main.pressure,
      feelsLike: data.main.feels_like,
      cloudCover: data.clouds.all,
      location: {
        lat: latitude,
        lon: longitude,
        name: data.name || 'Unknown',
      },
      fetchedAt: Date.now(),
    };

    // Cache the result
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(cacheKey, JSON.stringify(weather));
    }

    return weather;
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return getMockWeather(latitude, longitude);
  }
}

/**
 * Get weather forecast for the next N hours.
 * Returns hourly forecast data.
 */
export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  hoursAhead: number = 6, // How many hours into future
  apiKey?: string,
): Promise<WeatherForecast[]> {
  if (!apiKey) {
    console.warn('OpenWeatherMap API key not provided, returning mock forecast');
    return getMockForecast(latitude, longitude, hoursAhead);
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.statusText}`);
    }

    const data = await response.json();
    const now = Date.now();
    const limit = now + hoursAhead * 3600000;

    return data.list
      .filter((item: any) => item.dt * 1000 <= limit)
      .slice(0, hoursAhead)
      .map((item: any) => ({
        temperature: item.main.temp,
        weatherDescription: item.weather[0].description,
        windSpeedKmh: (item.wind.speed || 0) * 3.6,
        windDirection: item.wind.deg || 0,
        humidity: item.main.humidity,
        visibility: (item.visibility || 10000) / 1000,
        pressure: item.main.pressure,
        feelsLike: item.main.feels_like,
        cloudCover: item.clouds.all,
        rainfall: (item.rain?.['1h'] || 0) * 25.4, // mm
        snowfall: (item.snow?.['1h'] || 0) * 25.4, // mm
        forecastTime: item.dt * 1000,
        location: {
          lat: latitude,
          lon: longitude,
          name: data.city?.name || 'Unknown',
        },
        fetchedAt: Date.now(),
      }));
  } catch (error) {
    console.error('Failed to fetch weather forecast:', error);
    return getMockForecast(latitude, longitude, hoursAhead);
  }
}

/**
 * Get wind chill temperature (feels like).
 * Uses Canadian wind chill formula.
 */
export function calculateWindChill(temperature: number, windSpeedKmh: number): number {
  if (temperature > 0) return temperature; // Wind chill only applies below 0°C
  const tpow = Math.pow(windSpeedKmh, 0.16);
  return 13.12 + 0.6215 * temperature - 11.37 * tpow + 0.3965 * temperature * tpow;
}

/**
 * Determine if weather is suitable for driving (no heavy rain/snow).
 */
export function isGoodDrivingWeather(weather: WeatherData): boolean {
  const badKeywords = [
    'heavy rain',
    'thunderstorm',
    'heavy snow',
    'blizzard',
    'fog',
    'severe weather',
  ];
  const desc = weather.weatherDescription.toLowerCase();
  return !badKeywords.some((keyword) => desc.includes(keyword));
}

/**
 * Get fuel penalty multiplier based on weather conditions.
 */
export function getWeatherFuelPenalty(weather: WeatherData): number {
  let penalty = 0;

  // Temperature penalty
  if (weather.temperature < 5) {
    const tempDiff = 5 - weather.temperature;
    penalty += Math.min(5, tempDiff * 0.5); // Up to +5%
  }

  // Wind penalty
  if (weather.windSpeedKmh > 20) {
    penalty += Math.min(3, (weather.windSpeedKmh - 20) * 0.1); // Up to +3%
  }

  // Rain/snow penalty
  if (weather.weatherDescription.includes('rain')) {
    penalty += 2;
  }
  if (weather.weatherDescription.includes('snow')) {
    penalty += 4;
  }

  return penalty;
}

/**
 * Format weather for display.
 */
export function formatWeather(weather: WeatherData): string {
  return `${weather.temperature}°C, ${weather.weatherDescription}`;
}

// ─── Mock Data (for development/testing) ──────────────────────────────────────

function getMockWeather(latitude: number, longitude: number): WeatherData {
  // Simulate varied weather
  const hour = new Date().getHours();
  const temp = 15 + Math.sin((hour / 24) * Math.PI) * 10; // Vary 5-25°C
  const windSpeed = 10 + Math.random() * 15;

  return {
    temperature: temp,
    weatherDescription: 'Partly cloudy',
    windSpeedKmh: windSpeed,
    windDirection: Math.random() * 360,
    humidity: 60 + Math.random() * 30,
    visibility: 10,
    pressure: 1013,
    feelsLike: temp - windSpeed * 0.2,
    cloudCover: 30 + Math.random() * 40,
    location: {
      lat: latitude,
      lon: longitude,
      name: 'Current Location',
    },
    fetchedAt: Date.now(),
  };
}

function getMockForecast(latitude: number, longitude: number, hours: number): WeatherForecast[] {
  const forecast: WeatherForecast[] = [];
  const baseTemp = 15;

  for (let i = 1; i <= hours; i++) {
    const time = Date.now() + i * 3600000;
    const hour = new Date(time).getHours();
    const temp = baseTemp + Math.sin((hour / 24) * Math.PI) * 10 - i * 0.2;

    forecast.push({
      temperature: temp,
      weatherDescription: i % 3 === 0 ? 'Light rain' : 'Cloudy',
      windSpeedKmh: 10 + Math.random() * 10,
      windDirection: Math.random() * 360,
      humidity: 70,
      visibility: 10,
      pressure: 1013,
      feelsLike: temp - 2,
      cloudCover: 60,
      rainfall: i % 3 === 0 ? 1.5 : 0,
      snowfall: 0,
      forecastTime: time,
      location: {
        lat: latitude,
        lon: longitude,
        name: 'Current Location',
      },
      fetchedAt: Date.now(),
    });
  }

  return forecast;
}
