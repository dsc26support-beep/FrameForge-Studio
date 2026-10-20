import { useId } from 'react';
import type { ReactNode } from 'react';

interface NumProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange(v: number): void;
}

export function NumberField({ label, value, min, max, step = 1, unit, onChange }: NumProps) {
  const id = useId();
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <div className="field-row">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange(v: T): void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const id = useId();
  // <input type=color> only supports #rrggbb; keep the alpha channel (if any) untouched.
  const hex6 = /^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : '#000000';
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="color" value={hex6} onChange={(e) => onChange(e.target.value + (value.length === 9 ? value.slice(7) : ''))} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} rows={3} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
