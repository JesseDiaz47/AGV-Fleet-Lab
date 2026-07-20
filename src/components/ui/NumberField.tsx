interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

/** Clamped numeric input. Blank/invalid input is ignored on blur rather than coerced to 0. */
export function NumberField({ label, value, min, max, step = 1, suffix, onChange }: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {suffix ? ` (${suffix})` : ''}
      </span>
      <input
        type="number"
        className="field__input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
      />
    </label>
  )
}
