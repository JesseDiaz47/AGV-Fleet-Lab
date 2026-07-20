interface BoolFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function BoolField({ label, checked, onChange }: BoolFieldProps) {
  return (
    <label className="field field--bool">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="field__label">{label}</span>
    </label>
  )
}
