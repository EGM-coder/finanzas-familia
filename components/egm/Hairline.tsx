import React from 'react';

interface HairlineProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  dot?: boolean;
}

const Hairline = React.forwardRef<HTMLDivElement, HairlineProps>(
  ({ strong, dot, className, ...rest }, ref) => {
    const base = strong ? 'rule-strong' : dot ? 'rule-dot' : 'rule';
    const cls = [base, className].filter(Boolean).join(' ');
    return <div ref={ref} className={cls} {...rest} />;
  }
);
Hairline.displayName = 'Hairline';

export default Hairline;
