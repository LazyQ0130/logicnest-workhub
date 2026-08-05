import { Breadcrumb, Typography } from 'antd';
import type { ReactNode } from 'react';

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <Breadcrumb items={[{ title: '管理中心' }, { title: title }]} />
        <Typography.Title level={2}>{title}</Typography.Title>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {description && <Typography.Paragraph>{description}</Typography.Paragraph>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`content-panel ${className}`}>{children}</section>;
}
