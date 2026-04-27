import type { JSX, ReactNode } from 'react';

export type BannerTone = 'info' | 'warn' | 'error' | 'success';
export type BannerEmphasis = 'normal' | 'urgent';

export type BannerProps = {
  readonly tone: BannerTone;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly emphasis?: BannerEmphasis;
};

export function Banner({
  tone,
  children,
  action,
  emphasis = 'normal',
}: BannerProps): JSX.Element {
  return (
    <div
      className="weft-banner"
      data-tone={tone}
      data-emphasis={emphasis}
      role="status"
    >
      <span>{children}</span>
      {action !== undefined ? <span className="weft-banner-action-slot">{action}</span> : null}
    </div>
  );
}
