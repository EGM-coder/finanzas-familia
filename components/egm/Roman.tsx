import React from 'react';

interface RomanProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'span';
}

export function Roman({ as: Tag = 'div', className, ...rest }: RomanProps) {
  return <Tag className={['roman', className].filter(Boolean).join(' ')} {...rest} />;
}

export default Roman;
