// A form generated from a component schema or style params.
import type { PropSpec } from '../../core/validate';
import type { ParamSpec } from '../../core/render';

type Spec = (PropSpec | ParamSpec) & { min?: number; max?: number; step?: number };

export function SchemaForm({ schema, value, onChange }: { schema: Record<string, Spec>; value: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <div className="form">
      {Object.entries(schema).map(([k, spec]) => (
        <Field key={k} name={k} spec={spec} value={value[k]} onChange={(v) => onChange(k, v)} />
      ))}
    </div>
  );
}

export function Field({ name, spec, value, onChange }: { name: string; spec: Spec; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="field-label">{spec.label || name}</span>;
  switch (spec.type) {
    case 'bool':
      return <label className="field field-row">{label}<input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></label>;
    case 'number':
      return (
        <label className="field">{label}
          <div className="field-row">
            {spec.min !== undefined && spec.max !== undefined && (
              <input type="range" min={spec.min} max={spec.max} step={spec.step ?? 0.01} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
            )}
            <NumberInput value={Number(value ?? 0)} step={spec.step ?? 0.1} onChange={onChange} />
          </div>
        </label>
      );
    case 'select':
      return (
        <label className="field">{label}
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
            {(spec.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    case 'list':
      return (
        <label className="field">{label}
          <textarea rows={4} value={Array.isArray(value) ? value.join('\n') : ''} onChange={(e) => onChange(e.target.value.split('\n'))} placeholder="One item per line" />
        </label>
      );
    case 'color':
      return <label className="field field-row">{label}<input type="color" value={String(value ?? '#000000')} onChange={(e) => onChange(e.target.value)} /></label>;
    default:
      return <label className="field">{label}<input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} dir="auto" /></label>;
  }
}

export function NumberInput({ value, step = 0.1, onChange }: { value: number; step?: number; onChange: (v: number) => void }) {
  return <input className="num" type="number" step={step} value={Number.isFinite(value) ? +value.toFixed(3) : 0} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />;
}
