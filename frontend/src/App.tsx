import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  CloudSun,
  Download,
  Layers3,
  Leaf,
  LoaderCircle,
  Map,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Truck,
  TriangleAlert,
  Waves,
  Weight,
  Wind,
  X,
} from 'lucide-react';
import { api } from './api';
import PlaceSearch from './PlaceSearch';
import RouteMap, { riskColors, routeColors } from './RouteMap';
import type { Checkpoint, Corridor, Level, Place, Plan, Route } from './types';

const demoOrigin: Place = {
  name: 'Chicago, Illinois, United States',
  coordinate: [-87.6298, 41.8781],
};
const demoDestination: Place = {
  name: 'Detroit, Michigan, United States',
  coordinate: [-83.0458, 42.3314],
};
const levels: Level[] = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'];
const miles = (r: Route) => Math.round(r.distance_meters / 1609.344);
const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
const localDate = () => {
  const d = new Date(Date.now() + 3600000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Badge({ level }: { level: Level }) {
  return (
    <span className={`risk-badge risk-${levels.indexOf(level)}`}>
      <i />
      {level}
    </span>
  );
}

export default function App() {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [origin, setOrigin] = useState<Place | null>(demoOrigin),
    [destination, setDestination] = useState<Place | null>(demoDestination);
  const [departure, setDeparture] = useState(localDate),
    [load, setLoad] = useState('32000'),
    [spacing, setSpacing] = useState(25);
  const [plan, setPlan] = useState<Plan | null>(null),
    [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [corridorError, setCorridorError] = useState('');
  const [corridor, setCorridor] = useState<Corridor | null>(null),
    [corridorBusy, setCorridorBusy] = useState(false);
  const [heat, setHeat] = useState(true),
    [showPoints, setShowPoints] = useState(true),
    [hour, setHour] = useState(0),
    [playing, setPlaying] = useState(false);
  const [help, setHelp] = useState(false),
    [tab, setTab] = useState<'checkpoints' | 'comparison'>('checkpoints'),
    [focused, setFocused] = useState<Checkpoint | null>(null);
  const abort = useRef<AbortController | null>(null);
  const helpClose = useRef<HTMLButtonElement>(null);
  const route = plan?.routes.find((r) => r.id === selected);
  const recommended = plan?.routes.find((r) => r.id === plan.recommended_id);
  const dirty =
    !!plan &&
    (plan.mode !== mode ||
      plan.load_lb !== Number(load) ||
      new Date(plan.departure).getTime() !== new Date(departure || 0).getTime() ||
      plan.origin.name !== origin?.name ||
      plan.destination.name !== destination?.name ||
      plan.spacing_miles !== spacing);

  async function runPlan(requestedMode = mode) {
    if (requestedMode === 'live' && (!origin || !destination)) {
      setError('Select an origin and destination from the city search results.');
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError('');
    setCorridorError('');
    setCorridor(null);
    setPlaying(false);
    setHour(0);
    setFocused(null);
    try {
      const result = await api<Plan>(
        'plan',
        {
          mode: requestedMode,
          origin,
          destination,
          departure: new Date(departure).toISOString(),
          load_lb: Number(load),
          spacing_miles: spacing,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setPlan(result);
      setSelected(result.recommended_id || result.routes[0].id);
      setBusy(false);
      setCorridorBusy(true);
      try {
        const weather = await api<Corridor>(
          'corridor',
          {
            mode: result.mode,
            coordinates: result.corridor_coordinates,
            base_time: result.forecast_base,
            load_lb: result.load_lb,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) setCorridor(weather);
      } catch (e) {
        if (!controller.signal.aborted) setCorridorError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setCorridorBusy(false);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
        setBusy(false);
        setCorridorBusy(false);
      }
    }
  }
  useEffect(() => {
    void runPlan('demo');
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setHour((h) => (h >= 48 ? 0 : h + 1)), 650);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!help) return;
    helpClose.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelp(false);
      if (e.key === 'Tab') {
        e.preventDefault();
        helpClose.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [help]);
  const selectRoute = (id: string) => {
    setSelected(id);
    setFocused(null);
  };
  const exportPlan = () => {
    if (!plan) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spotter-${plan.mode}-trip.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Application navigation">
        <a className="brand-mark" href="/" aria-label="Spotter home">
          <Navigation size={25} strokeWidth={2.5} />
        </a>
        <div className="rail-divider" />
        <button className="rail-active" aria-label="Route planner">
          <RouteIcon size={22} />
        </button>
        <div className="rail-bottom">
          <button aria-label="How risk is calculated" onClick={() => setHelp(true)}>
            <CircleHelp size={21} />
          </button>
          <span className="avatar">JD</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="wordmark" href="/">
            spotter<span> / </span>
            <small>Route intelligence</small>
          </a>
          <div className="topbar-right">
            <span className={`connection ${mode === 'demo' ? 'demo' : 'live'}`}>
              <i />
              {mode === 'demo' ? 'Demo workspace' : 'Live data mode'}
            </span>
            <span className="topbar-divider" />
            <Truck size={17} />
            <span className="fleet-name">Driver workspace</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PLAN WITH CONFIDENCE</div>
              <h1>
                A safer way forward<span>.</span>
              </h1>
              <p>Know what’s ahead. Choose the right route for your load.</p>
            </div>
            <button className="subtle-button" onClick={() => setHelp(true)}>
              <CircleHelp size={16} /> How it works <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="planner-layout">
            <section className="planning-column" aria-label="Trip planning">
              <form
                className="trip-form card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runPlan();
                }}
              >
                <div className="section-heading">
                  <div className="heading-icon">
                    <SlidersHorizontal size={18} />
                  </div>
                  <h2>Your trip</h2>
                  <span className="step-tag">01</span>
                </div>
                <div className="mode-toggle" aria-label="Data mode">
                  <button
                    type="button"
                    className={mode === 'demo' ? 'active' : ''}
                    aria-pressed={mode === 'demo'}
                    onClick={() => {
                      setMode('demo');
                      setOrigin(demoOrigin);
                      setDestination(demoDestination);
                    }}
                  >
                    Demo trip
                  </button>
                  <button
                    type="button"
                    className={mode === 'live' ? 'active' : ''}
                    aria-pressed={mode === 'live'}
                    onClick={() => setMode('live')}
                  >
                    Live planning <span className="tiny-dot" />
                  </button>
                </div>
                {mode === 'demo' && (
                  <p className="demo-note">Explore Chicago → Detroit with simulated weather.</p>
                )}
                <div className="location-fields">
                  <PlaceSearch
                    label="Origin"
                    value={origin}
                    onChange={setOrigin}
                    disabled={mode === 'demo' || busy}
                  />
                  <button
                    type="button"
                    className="swap-button"
                    disabled={mode === 'demo' || busy}
                    aria-label="Swap origin and destination"
                    onClick={() => {
                      setOrigin(destination);
                      setDestination(origin);
                    }}
                  >
                    <ArrowDownUp size={15} />
                  </button>
                  <PlaceSearch
                    label="Destination"
                    value={destination}
                    onChange={setDestination}
                    disabled={mode === 'demo' || busy}
                  />
                </div>
                <div className="field">
                  <label htmlFor="departure">
                    Departure <span>Your local time</span>
                  </label>
                  <input
                    id="departure"
                    type="datetime-local"
                    value={departure}
                    required
                    onChange={(e) => setDeparture(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="load">Load weight</label>
                  <div className="input-wrap">
                    <Weight size={16} />
                    <input
                      id="load"
                      type="number"
                      min="0"
                      max="150000"
                      step="1"
                      value={load}
                      required
                      onChange={(e) => setLoad(e.target.value)}
                    />
                    <span className="input-unit">lb</span>
                  </div>
                  <small>Weather risk adjusts to your cargo weight.</small>
                </div>
                <fieldset className="spacing-field">
                  <legend>Weather checkpoints</legend>
                  <div className="spacing-buttons">
                    {[10, 25, 50].map((n) => (
                      <button
                        type="button"
                        key={n}
                        aria-pressed={spacing === n}
                        className={spacing === n ? 'active' : ''}
                        onClick={() => setSpacing(n)}
                      >
                        {n} <span>mi</span>
                        {spacing === n && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button className="primary-button" type="submit" disabled={busy}>
                  {busy ? <LoaderCircle size={17} className="spin" /> : <RouteIcon size={17} />}{' '}
                  {busy ? 'Checking the road ahead…' : 'Find safest routes'}
                  {!busy && <ArrowRight size={17} />}
                </button>
                {error && (
                  <div className="error-message" role="alert">
                    <TriangleAlert size={16} />
                    <span>{error}</span>
                  </div>
                )}
              </form>
              <div className="route-list-heading">
                <h2>Route options</h2>
                <span>{plan?.routes.length || 0} available</span>
              </div>
              {busy && (
                <div className="loading-routes" role="status">
                  <LoaderCircle className="spin" size={18} />
                  <span>Comparing routes and arrival-time forecasts…</span>
                </div>
              )}
              {!busy &&
                plan?.routes.map((r, i) => (
                  <button
                    key={r.id}
                    className={`route-card card ${selected === r.id ? 'selected' : ''}`}
                    onClick={() => selectRoute(r.id)}
                    aria-pressed={selected === r.id}
                  >
                    <div className="route-card-top">
                      <span className="route-name">
                        <i style={{ background: routeColors[i] }} />
                        {r.name}
                      </span>
                      {r.id === plan.recommended_id ? (
                        <span className="recommended-tag">
                          <ShieldCheck size={12} /> Recommended
                        </span>
                      ) : (
                        <Badge level={r.summary.max_risk} />
                      )}
                    </div>
                    <div className="route-numbers">
                      <strong>{duration(r.duration_seconds)}</strong>
                      <span>·</span>
                      <span>{miles(r)} miles</span>
                      <span className="selection-circle">
                        {selected === r.id && <Check size={12} />}
                      </span>
                    </div>
                    <div className="risk-distribution">
                      {levels.map((level, index) => (
                        <span
                          key={level}
                          style={{
                            width: `${(r.summary.risk_miles[level] / (r.distance_meters / 1609.344)) * 100}%`,
                            background: riskColors[index],
                          }}
                        />
                      ))}
                    </div>
                    <div className="route-card-footer">
                      <span>
                        {r.summary.eligible
                          ? `${r.summary.risk_miles.Severe.toFixed(0)} severe · ${r.summary.risk_miles.High.toFixed(0)} high mi`
                          : 'No Travel · departure not advised'}
                      </span>
                      <span>{r.checkpoints.length} checks</span>
                    </div>
                  </button>
                ))}
              <div className="planning-footnote">
                <ShieldCheck size={15} />
                <p>
                  Better decisions start with better visibility.
                  <br />
                  Recheck forecasts before you depart.
                </p>
              </div>
            </section>
            <section className="results-column" aria-label="Route results">
              <div className={`recommendation-banner ${plan && !recommended ? 'blocked' : ''}`}>
                <div className="recommendation-icon">
                  {plan && !recommended ? <TriangleAlert size={23} /> : <ShieldCheck size={23} />}
                </div>
                <div>
                  <div className="eyebrow">
                    {recommended
                      ? 'YOUR RECOMMENDED ROUTE'
                      : plan
                        ? 'DEPARTURE NOT ADVISED'
                        : 'LOOKING AHEAD'}
                  </div>
                  <h2>
                    {recommended
                      ? `${recommended.name}. A clearer road ahead.`
                      : plan
                        ? 'Wait for safer conditions.'
                        : 'Every mile, a little more certain.'}
                  </h2>
                  <p>
                    {recommended
                      ? `Lowest severe exposure, then high-risk miles, average risk and travel time.`
                      : plan
                        ? 'Every route contains a No Travel checkpoint. Try a different departure.'
                        : 'Compare weather and travel time before you set off.'}
                  </p>
                </div>
                {recommended && (
                  <span className="banner-time">
                    <Clock3 size={15} />
                    {duration(recommended.duration_seconds)}
                  </span>
                )}
              </div>
              {dirty && (
                <div className="stale-notice" role="status">
                  Trip settings changed. Select “Find safest routes” to update these results.
                </div>
              )}
              <div className="map-card card">
                <div className="map-toolbar">
                  <div className="map-title">
                    <Map size={17} />
                    <h2>Route overview</h2>
                    <span className="small-badge">
                      {plan?.mode === 'demo' ? 'SIMULATION' : 'FORECAST'}
                    </span>
                  </div>
                  <div className="map-toggles">
                    <button
                      aria-pressed={heat}
                      className={heat ? 'active' : ''}
                      onClick={() => setHeat(!heat)}
                    >
                      <Layers3 size={14} />
                      <span>Weather layer</span>
                    </button>
                    <button
                      aria-pressed={showPoints}
                      className={showPoints ? 'active' : ''}
                      onClick={() => setShowPoints(!showPoints)}
                    >
                      <MapPin size={14} />
                      <span>Checkpoints</span>
                    </button>
                  </div>
                </div>
                <div className="map-wrap">
                  <RouteMap
                    plan={plan}
                    selected={selected}
                    onSelect={selectRoute}
                    corridor={corridor}
                    hour={hour}
                    heat={heat}
                    showPoints={showPoints}
                    focused={focused}
                  />
                  <div className="map-status">
                    <span className="tiny-dot" />
                    {plan?.mode === 'demo' ? 'Simulated weather' : 'Arrival-time weather'}
                    <span>·</span>
                    {plan?.spacing_miles || spacing} mi checkpoints
                  </div>
                  {busy && (
                    <div className="map-loading">
                      <LoaderCircle className="spin" size={28} />
                      <span>Mapping your options</span>
                    </div>
                  )}
                  <div className="map-legend">
                    {levels.map((l, i) => (
                      <span key={l}>
                        <i style={{ background: riskColors[i] }} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="forecast-panel">
                  <div className="forecast-title">
                    <span>
                      <CloudSun size={18} />
                      <strong>Weather outlook</strong>
                      <small>Trip corridor · 48-hour forecast</small>
                    </span>
                    <span className="forecast-date">
                      {corridor
                        ? new Date(
                            new Date(corridor.base_time).getTime() + hour * 3600000,
                          ).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Awaiting weather'}
                    </span>
                  </div>
                  <div className="slider-row">
                    <button
                      className="play-button"
                      aria-label={playing ? 'Pause forecast' : 'Play forecast'}
                      disabled={!corridor}
                      onClick={() => setPlaying(!playing)}
                    >
                      {playing ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <div className="slider-track">
                      <input
                        aria-label="Forecast hour"
                        type="range"
                        min="0"
                        max="48"
                        step="1"
                        value={hour}
                        disabled={!corridor}
                        onChange={(e) => {
                          setHour(Number(e.target.value));
                          setPlaying(false);
                        }}
                      />
                      <div className="slider-labels">
                        <span>Now</span>
                        <span>+12h</span>
                        <span>+24h</span>
                        <span>+36h</span>
                        <span>+48h</span>
                      </div>
                    </div>
                    <span className="forecast-hour">+{hour}h</span>
                  </div>
                  <div className="forecast-caption" role="status">
                    {corridorBusy ? (
                      <>
                        <LoaderCircle size={12} className="spin" /> Loading the weather corridor…
                      </>
                    ) : corridorError ? (
                      <span className="field-error">
                        Weather layer unavailable: {corridorError}
                      </span>
                    ) : (
                      <>
                        Spatial risk at the selected hour. Route recommendations use each
                        checkpoint’s arrival time.
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="details-card card">
                <div className="details-toolbar">
                  <div className="detail-tabs">
                    <button
                      className={tab === 'checkpoints' ? 'active' : ''}
                      onClick={() => setTab('checkpoints')}
                    >
                      <MapPin size={15} /> Checkpoints <span>{route?.checkpoints.length || 0}</span>
                    </button>
                    <button
                      className={tab === 'comparison' ? 'active' : ''}
                      onClick={() => setTab('comparison')}
                    >
                      <RouteIcon size={15} /> Compare routes
                    </button>
                  </div>
                  <button className="export-button" onClick={exportPlan} disabled={!plan}>
                    <Download size={15} />
                    <span>Export trip</span>
                  </button>
                </div>
                {route && (
                  <div className="details-summary">
                    <span>
                      <i style={{ background: routeColors[plan!.routes.indexOf(route)] }} />
                      {route.name}
                    </span>
                    <span>
                      <Navigation size={13} />
                      {miles(route)} mi
                    </span>
                    <span>
                      <Clock3 size={13} />
                      Arrival {time(route.checkpoints.at(-1)!.eta)}
                    </span>
                    <span className="timezone-note">Times in your local timezone</span>
                  </div>
                )}
                <div className="table-scroll">
                  {tab === 'checkpoints' ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Checkpoint</th>
                          <th>ETA</th>
                          <th>
                            <Wind size={12} /> Wind
                          </th>
                          <th>
                            <Waves size={12} /> Rain
                          </th>
                          <th>
                            <Snowflake size={12} /> Snow
                          </th>
                          <th>Risk level</th>
                          <th>
                            <span className="sr-only">Show on map</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {route?.checkpoints.map((p, i) => (
                          <tr key={`${route.id}-${i}`} className={focused === p ? 'focused' : ''}>
                            <td>
                              <span className="checkpoint-number">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span>
                                {p.mile.toFixed(0)} mi{' '}
                                {i === 0 ? (
                                  <small>· Start</small>
                                ) : i === route.checkpoints.length - 1 ? (
                                  <small>· End</small>
                                ) : null}
                              </span>
                            </td>
                            <td>
                              {time(p.eta)}
                              <small className="eta-date">
                                {new Date(p.eta).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </small>
                            </td>
                            <td>
                              {p.weather.wind_mph.toFixed(1)} <small>mph</small>
                            </td>
                            <td>
                              {p.weather.rain_in.toFixed(2)} <small>in/hr</small>
                            </td>
                            <td>
                              {p.weather.snow_in.toFixed(2)} <small>in/hr</small>
                            </td>
                            <td>
                              <Badge level={p.risk.level} />
                            </td>
                            <td>
                              <button
                                className="table-map-button"
                                aria-label={`Show checkpoint ${i + 1} on map`}
                                onClick={() => {
                                  setFocused(p);
                                  setShowPoints(true);
                                }}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>Route</th>
                          <th>No Travel</th>
                          <th>Severe miles</th>
                          <th>High miles</th>
                          <th>Avg. risk / 4</th>
                          <th>Travel time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan?.routes.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button className="text-button" onClick={() => selectRoute(r.id)}>
                                {r.name}
                                {r.id === plan.recommended_id && <ShieldCheck size={13} />}
                              </button>
                            </td>
                            <td>{r.summary.eligible ? 'None' : 'Excluded'}</td>
                            <td>{r.summary.risk_miles.Severe.toFixed(1)} mi</td>
                            <td>{r.summary.risk_miles.High.toFixed(1)} mi</td>
                            <td>{r.summary.average_risk.toFixed(2)}</td>
                            <td>{duration(r.duration_seconds)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="table-footer">
                  <CheckCheck size={13} />
                  <span>
                    {plan?.mode === 'demo'
                      ? 'Simulated weather · recorded road geometries'
                      : plan?.provider || 'Preparing route data'}
                  </span>
                  <span className="footer-right">
                    Load: {plan?.load_lb.toLocaleString() || '—'} lb
                  </span>
                </div>
              </div>
              {plan?.warnings.map((w) => (
                <div className="data-notice" key={w}>
                  <TriangleAlert size={14} />
                  <span>{w}</span>
                </div>
              ))}
            </section>
          </div>
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> A little foresight. A better journey.
            </span>
            <span>
              SPOTTER <i /> WEATHER-AWARE ROUTING
            </span>
          </footer>
        </main>
      </div>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="help-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={helpClose}
              className="modal-close"
              aria-label="Close explanation"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <ShieldCheck size={30} className="help-icon" />
            <div className="eyebrow">THE METHOD BEHIND THE MAP</div>
            <h2 id="help-title">Weather changes. Plan for it.</h2>
            <p>
              We sample the road every 10, 25 or 50 miles and match the forecast to the estimated
              arrival time at each checkpoint. The highest wind, rain or snow risk determines that
              checkpoint’s level.
            </p>
            <div className="table-scroll">
              <table className="rules-table">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Wind · mph</th>
                    <th>Rain · in/hr</th>
                    <th>Snow · in/hr</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Low', '<25', '<0.10', '<0.5'],
                    ['Moderate', '25–<35', '0.10–<0.25', '0.5–<1'],
                    ['High', '35–<45', '0.25–<0.50', '1–<2'],
                    ['Severe', '45–<55', '0.50–1.00', '2–3'],
                    ['No Travel', '≥55', '>1.00', '>3'],
                  ].map((row) => (
                    <tr key={row[0]}>
                      {row.map((v, i) => (
                        <td key={i}>{i === 0 ? <Badge level={v as Level} /> : v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Weight changes the equation</h3>
            <p>
              Wind ≥55 mph means No Travel at any load. At 45–&lt;55 mph, loads above 30,000 lb are
              No Travel. At 35–&lt;45 mph, loads above 40,000 lb are at least Severe.
            </p>
            <h3>How we choose</h3>
            <p>
              No Travel routes are excluded. Remaining routes are compared in order: fewest Severe
              miles → fewest High miles → lowest distance-weighted average risk → shortest travel
              time. Each interval uses the worse of its two checkpoint risks.
            </p>
            <p className="help-footnote">
              The weather layer shows an interpolated spatial forecast for a single hour; moving the
              slider does not change arrival-time recommendations. Forecasts are estimates. Truck
              dimensions, traffic and rest stops require separate planning.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
