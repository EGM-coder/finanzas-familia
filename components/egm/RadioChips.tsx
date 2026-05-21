// Stub temporal. No hay CSS ni maqueta en Fase 4.
import React from 'react';

interface RadioChipsProps {
  options: string[];
  active?: string;
  onChange?: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const RadioChips = React.forwardRef<HTMLDivElement, RadioChipsProps>(
  ({ options, active: _active, onChange, className, style }, ref) => {
    return (
      <div ref={ref} className={className} style={style}>
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onChange?.(opt)}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
);
RadioChips.displayName = 'RadioChips';

export default RadioChips;
