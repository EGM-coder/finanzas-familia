import React from 'react';

interface LabelProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'span';
}

export function Label({ as: Tag = 'div', className, ...rest }: LabelProps) {
  return <Tag className={['label', className].filter(Boolean).join(' ')} {...rest} />;
}

export default Label;
