// Stub temporal. No hay CSS ni maqueta en Fase 4.
import React from 'react';

interface ToggleProps {
  on?: boolean;
  onChange?: (next: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ on, onChange, className, style }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={className}
        style={style}
        onClick={() => onChange?.(!on)}
      />
    );
  }
);
Toggle.displayName = 'Toggle';

export default Toggle;
