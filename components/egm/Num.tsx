import React from 'react';

interface NumProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'span' | 'div';
}

export function Num({ as: Tag = 'span', className, ...rest }: NumProps) {
  return <Tag className={['num', className].filter(Boolean).join(' ')} {...rest} />;
}

export default Num;
