import type { CSSProperties } from 'react';

export function Icon({
  name,
  size = 20,
  style,
}: {
  name:
    | 'search'
    | 'map'
    | 'expand'
    | 'close'
    | 'arrow'
    | 'reset'
    | 'chevron'
    | 'link';
  size?: number;
  style?: CSSProperties;
}) {
  const paths = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    map: (
      <>
        <path d="m4 5 6-2 5 3 5-2v15l-5 2-5-3-6 2Z M10 3v15 M15 6v15" />
      </>
    ),
    expand: (
      <path d="M9 4H4v5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M4 4l6 6 M20 4l-6 6 M20 20l-6-6 M4 20l6-6" />
    ),
    close: <path d="m6 6 12 12 M18 6 6 18" />,
    arrow: <path d="M5 12h14 m-6-6 6 6-6 6" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 2 8 M4 4v6h6" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    link: (
      <path d="m9 15 6-6 M8 11l-3 3a4 4 0 0 0 5 5l3-3 M11 8l3-3a4 4 0 0 1 5 5l-3 3" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
