import React from 'react';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'fill' | 'ghost';
}

const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant, className, type = 'button', ...rest }, ref) => {
    const base = variant === 'fill' ? 'btn btn-fill'
               : variant === 'ghost' ? 'btn btn-ghost'
               : 'btn';
    const cls = [base, className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={cls} {...rest} />;
  }
);
Btn.displayName = 'Btn';

export default Btn;
