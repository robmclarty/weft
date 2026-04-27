/**
 * Tiny inline SVG glyphs, one per primitive kind.
 *
 * Inline SVG keeps `@repo/core` free of an icon-library runtime dependency,
 * which would leak into consumers of the published `@robmclarty/weft`
 * umbrella. Each glyph renders at 11px (matching the badge font scale) and
 * inherits `currentColor` so per-kind palette tinting works without any
 * extra wiring.
 */

import type { JSX } from 'react';

const SVG = {
  width: 12,
  height: 12,
  viewBox: '0 0 12 12',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function StepGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SequenceGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <line x1="2" y1="3" x2="10" y2="3" />
      <line x1="2" y1="6" x2="10" y2="6" />
      <line x1="2" y1="9" x2="10" y2="9" />
    </svg>
  );
}

export function ParallelGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <line x1="2" y1="6" x2="5" y2="6" />
      <line x1="5" y1="6" x2="10" y2="2.5" />
      <line x1="5" y1="6" x2="10" y2="6" />
      <line x1="5" y1="6" x2="10" y2="9.5" />
    </svg>
  );
}

export function PipeGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <line x1="2" y1="6" x2="9" y2="6" />
      <polyline points="6 3, 9 6, 6 9" />
    </svg>
  );
}

export function RetryGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M 9.5 4 A 3.5 3.5 0 1 0 9.5 8" />
      <polyline points="9.5 1.5, 9.5 4, 7 4" />
    </svg>
  );
}

export function ScopeGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M 4 2 Q 2.5 2 2.5 4 V 5.5 Q 2.5 6 1.5 6 Q 2.5 6 2.5 6.5 V 8 Q 2.5 10 4 10" />
      <path d="M 8 2 Q 9.5 2 9.5 4 V 5.5 Q 9.5 6 10.5 6 Q 9.5 6 9.5 6.5 V 8 Q 9.5 10 8 10" />
    </svg>
  );
}

export function StashGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <circle cx="3.5" cy="6" r="1.5" />
      <line x1="5" y1="6" x2="10" y2="6" />
      <line x1="9" y1="4.5" x2="10" y2="6" />
      <line x1="9" y1="7.5" x2="10" y2="6" />
    </svg>
  );
}

export function UseGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <circle cx="8.5" cy="6" r="1.5" />
      <line x1="2" y1="6" x2="7" y2="6" />
      <line x1="3" y1="4.5" x2="2" y2="6" />
      <line x1="3" y1="7.5" x2="2" y2="6" />
    </svg>
  );
}

export function CycleGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M 2.5 6 A 3.5 3.5 0 1 0 6 2.5" />
      <polyline points="3.5 4.5, 2.5 6, 1 5" />
    </svg>
  );
}

export function WarnGlyph(): JSX.Element {
  return (
    <svg {...SVG} aria-hidden="true">
      <path d="M 6 2 L 11 10 L 1 10 Z" />
      <line x1="6" y1="5" x2="6" y2="7.5" />
      <circle cx="6" cy="9" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
