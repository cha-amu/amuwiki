export function Icon({
  name,
  size = 20,
}: {
  name: 'map' | 'reset';
  size?: number;
}) {
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
    >
      {name === 'map' ? (
        <path d="m4 5 6-2 5 3 5-2v15l-5 2-5-3-6 2Z M10 3v15 M15 6v15" />
      ) : (
        <path d="M4 10a8 8 0 1 1 2 8 M4 4v6h6" />
      )}
    </svg>
  );
}
