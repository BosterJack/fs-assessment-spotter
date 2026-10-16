import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, LoaderCircle } from 'lucide-react';
import { api } from './api';
import type { Place } from './types';

export default function PlaceSearch({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(value?.name || '');
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);
  useEffect(() => {
    if (disabled || query.trim().length < 2 || query === value?.name) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const data = await api<{ places: Place[] }>(
          `places?q=${encodeURIComponent(query)}`,
          undefined,
          controller.signal,
        );
        setOptions(data.places);
        setOpen(true);
        setActive(-1);
        if (!data.places.length) setError('No cities found. Try a nearby city.');
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setBusy(false);
    };
  }, [query, value, disabled]);
  const choose = (p: Place) => {
    onChange(p);
    setQuery(p.name);
    setOpen(false);
  };
  return (
    <div
      className="field"
      ref={wrapper}
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <MapPin size={16} />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={query}
          disabled={disabled}
          placeholder="Search a city…"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
            setOptions([]);
            setActive(-1);
            setOpen(false);
            setError('');
          }}
          onFocus={() => options.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, options.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && open && active >= 0 && options[active]) {
              e.preventDefault();
              choose(options[active]);
            }
          }}
        />
        {busy && <LoaderCircle size={15} className="spin" />}
      </div>
      {open && options.length > 0 && (
        <div className="place-options" role="listbox" id={`${id}-options`}>
          {options.map((p, i) => (
            <button
              type="button"
              role="option"
              aria-selected={active === i}
              id={`${id}-${i}`}
              key={`${p.coordinate}`}
              className={active === i ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <MapPin size={14} />
              {p.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <small className="field-error" role="status">
          {error}
        </small>
      )}
    </div>
  );
}
