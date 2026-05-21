import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  soft?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ soft, className, ...rest }, ref) => {
    const base = soft ? 'card-soft' : 'card';
    const cls = [base, className].filter(Boolean).join(' ');
    return <div ref={ref} className={cls} {...rest} />;
  }
);
Card.displayName = 'Card';

export default Card;
