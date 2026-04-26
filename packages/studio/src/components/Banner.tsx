import type { JSX, ReactNode } from 'react';

export type BannerTone = 'info' | 'warn' | 'error' | 'success';

export type BannerProps = {
  readonly tone: BannerTone;
  readonly children: ReactNode;
  readonly action?: ReactNode;
};

export function Banner({ tone, children, action }: BannerProps): JSX.Element {
  return (
    <div className="weft-banner" data-tone={tone} role="status">
      <span>{children}</span>
      {action !== undefined ? <span style={{ marginLeft: 8 }}>{action}</span> : null}
    </div>
  );
}
