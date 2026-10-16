export type Coordinate = [number, number];
export type Level = 'Low' | 'Moderate' | 'High' | 'Severe' | 'No Travel';
export type Place = { name: string; coordinate: Coordinate };
export type Risk = { score: number; level: Level; factors: Record<string, Level> };
export type Weather = {
  wind_mph: number;
  rain_in: number;
  snow_in: number;
  temperature_f: number;
  forecast_time: string;
};
export type Checkpoint = {
  coordinate: Coordinate;
  mile: number;
  eta: string;
  weather: Weather;
  risk: Risk;
};
export type Route = {
  id: string;
  name: string;
  geometry: Coordinate[];
  distance_meters: number;
  duration_seconds: number;
  checkpoints: Checkpoint[];
  summary: {
    risk_miles: Record<Level, number>;
    average_risk: number;
    max_risk: Level;
    eligible: boolean;
  };
};
export type Plan = {
  routes: Route[];
  recommended_id: string | null;
  mode: 'demo' | 'live';
  provider: string;
  warnings: string[];
  departure: string;
  forecast_base: string;
  corridor_coordinates: Coordinate[];
  load_lb: number;
  spacing_miles: number;
  origin: Place;
  destination: Place;
};
export type Corridor = {
  base_time: string;
  cells: { coordinate: Coordinate; scores: number[]; wind_mph: number[] }[];
};
