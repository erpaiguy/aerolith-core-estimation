import type { BoqCarryMode } from "@aerolith/calc";
import { CARRY_MODE_OPTIONS } from "./boqCarry";

export function CarryModeControl({
  value,
  disabled,
  onChange,
}: {
  value: BoqCarryMode;
  disabled?: boolean;
  onChange: (mode: BoqCarryMode) => void;
}) {
  return (
    <div className="seg wrap" role="group" aria-label="Carry to BOQ">
      {CARRY_MODE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          className={value === opt.id ? "primary" : ""}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
