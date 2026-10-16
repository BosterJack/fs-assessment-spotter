import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import type { Checkpoint, Corridor, Plan, Route } from './types';

export const riskColors = ['#22a477', '#d8ae32', '#ee8c38', '#dc4b48', '#8d2852'];
export const routeColors = ['#18795d', '#5574c4', '#9572b8'];
const position = (c: [number, number]): [number, number] => [c[1], c[0]];

function Controls({ routes }: { routes: Route[] }) {
  const map = useMap();
  const fit = () =>
    map.fitBounds(L.latLngBounds(routes.flatMap((r) => r.geometry.map(position))), {
      padding: [45, 45],
    });
  useEffect(() => {
    fit();
  }, [routes, map]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return (
    <div className="map-controls">
      <button aria-label="Zoom in" onClick={() => map.zoomIn()}>
        <Plus size={18} />
      </button>
      <button aria-label="Zoom out" onClick={() => map.zoomOut()}>
        <Minus size={18} />
      </button>
      <button aria-label="Fit all routes" onClick={fit}>
        <LocateFixed size={18} />
      </button>
    </div>
  );
}

function Heatmap({ corridor, hour }: { corridor: Corridor; hour: number }) {
  const overlay = useMemo(() => {
    if (corridor.cells.length !== 49) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixels = ctx.createImageData(192, 192);
    const palette = [
      [56, 181, 138],
      [233, 202, 66],
      [241, 150, 62],
      [224, 77, 65],
      [133, 37, 79],
    ];
    for (let y = 0; y < 192; y++)
      for (let x = 0; x < 192; x++) {
        const gx = (x / 191) * 6,
          gy = ((191 - y) / 191) * 6;
        const x0 = Math.min(5, Math.floor(gx)),
          y0 = Math.min(5, Math.floor(gy));
        const dx = gx - x0,
          dy = gy - y0;
        const score =
          (corridor.cells[y0 * 7 + x0].scores[hour] * (1 - dx) +
            corridor.cells[y0 * 7 + x0 + 1].scores[hour] * dx) *
            (1 - dy) +
          (corridor.cells[(y0 + 1) * 7 + x0].scores[hour] * (1 - dx) +
            corridor.cells[(y0 + 1) * 7 + x0 + 1].scores[hour] * dx) *
            dy;
        const i = Math.min(3, Math.floor(score)),
          f = score - i,
          offset = (y * 192 + x) * 4;
        for (let c = 0; c < 3; c++)
          pixels.data[offset + c] = palette[i][c] * (1 - f) + palette[i + 1][c] * f;
        pixels.data[offset + 3] = 155;
      }
    ctx.putImageData(pixels, 0, 0);
    const lats = corridor.cells.map((c) => c.coordinate[1]),
      lons = corridor.cells.map((c) => c.coordinate[0]);
    return {
      url: canvas.toDataURL(),
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ] as [[number, number], [number, number]],
    };
  }, [corridor, hour]);
  return (
    overlay && (
      <ImageOverlay url={overlay.url} bounds={overlay.bounds} opacity={0.52} zIndex={250} />
    )
  );
}

export default function RouteMap({
  plan,
  selected,
  onSelect,
  corridor,
  hour,
  heat,
  showPoints,
  focused,
}: {
  plan: Plan | null;
  selected: string;
  onSelect: (id: string) => void;
  corridor: Corridor | null;
  hour: number;
  heat: boolean;
  showPoints: boolean;
  focused: Checkpoint | null;
}) {
  const [tileError, setTileError] = useState(false);
  const selectedRoute = plan?.routes.find((r) => r.id === selected);
  const ordered = plan
    ? [
        ...plan.routes.filter((r) => r.id !== selected),
        ...plan.routes.filter((r) => r.id === selected),
      ]
    : [];
  return (
    <MapContainer
      center={[42, -85.5]}
      zoom={7}
      zoomControl={false}
      className="route-map"
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        eventHandlers={{ tileerror: () => setTileError(true) }}
      />
      {tileError && (
        <div className="tile-notice">
          Map tiles unavailable. Routes and checkpoints remain visible.
        </div>
      )}
      {heat && corridor && <Heatmap corridor={corridor} hour={hour} />}
      {ordered.map((r) => (
        <Polyline
          key={r.id}
          positions={r.geometry.map(position)}
          pathOptions={{
            color: routeColors[plan!.routes.indexOf(r)],
            weight: r.id === selected ? 6 : 4,
            opacity: r.id === selected ? 1 : 0.55,
            lineCap: 'round',
          }}
          eventHandlers={{ click: () => onSelect(r.id) }}
        />
      ))}
      {showPoints &&
        selectedRoute?.checkpoints.map((p, i) => (
          <CircleMarker
            key={`${selected}-${i}`}
            center={position(p.coordinate)}
            radius={focused === p ? 9 : 5}
            pathOptions={{
              color: 'white',
              weight: 2,
              fillColor: riskColors[p.risk.score],
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="checkpoint-popup">
                <strong>
                  Checkpoint {i + 1} · {p.mile.toFixed(1)} mi
                </strong>
                <span style={{ color: riskColors[p.risk.score] }}>{p.risk.level} risk</span>
                <span>Arrival: {new Date(p.eta).toLocaleString()}</span>
                <span>
                  Wind {p.weather.wind_mph.toFixed(1)} mph · Rain {p.weather.rain_in.toFixed(2)}{' '}
                  in/hr
                </span>
                <span>Snow {p.weather.snow_in.toFixed(2)} in/hr</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      {plan &&
        [plan.origin, plan.destination].map((p, i) => (
          <Marker
            key={i}
            position={position(p.coordinate)}
            icon={L.divIcon({
              className: 'endpoint-icon',
              html: `<span class="endpoint ${i ? 'destination' : ''}">${i ? 'B' : 'A'}</span>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })}
          >
            <Popup>{p.name}</Popup>
          </Marker>
        ))}
      {plan && <Controls routes={plan.routes} />}
      {focused && <Focus point={focused} />}
    </MapContainer>
  );
}

function Focus({ point }: { point: Checkpoint }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position(point.coordinate), Math.max(map.getZoom(), 9), { duration: 0.5 });
  }, [point, map]);
  return null;
}
