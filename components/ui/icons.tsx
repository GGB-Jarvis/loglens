type IconProps = { className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  shapeRendering: "crispEdges" as const,
};

export function LogMark({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect height="2" width="20" x="2" y="2" />
      <rect height="20" width="2" x="2" y="2" />
      <rect height="2" width="12" x="2" y="20" />
      <rect height="2" width="10" x="6" y="6" />
      <rect height="2" width="14" x="6" y="10" />
      <rect height="2" width="6" x="6" y="14" />
      <rect height="4" width="4" x="12" y="14" />
      <rect height="2" width="2" x="18" y="10" />
      <rect height="2" width="2" x="20" y="12" />
    </svg>
  );
}

export function Arrow({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M2 8h10M8 4l4 4-4 4" />
    </svg>
  );
}

export function ArrowUpRight({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M3 13 13 3M5 3h8v8" />
    </svg>
  );
}

export function Chevron({ className = "h-3 w-3" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 12 12" {...stroke}>
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  );
}

export function Search({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M2 2h8v8H2zM10 10l4 4" />
    </svg>
  );
}

export function Download({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M8 2v8M4 7l4 4 4-4M2 14h12" />
    </svg>
  );
}

export function Check({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="m2 8 3 3 3-3M8 8l2 3 5-6" />
    </svg>
  );
}

export function Alert({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M8 2h2l5 10v2H1v-2L7 2h1ZM8 6v4M8 12v1" />
    </svg>
  );
}

export function Close({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="m3 3 10 10M13 3 3 13" />
    </svg>
  );
}

export function Cube({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M8 1 15 5v6l-7 4-7-4V5l7-4ZM1 5l7 4 7-4M8 9v6" />
    </svg>
  );
}

export function Layers({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M8 1 15 5 8 9 1 5l7-4ZM1 8l7 4 7-4M1 11l7 4 7-4" />
    </svg>
  );
}

export function Doc({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M3 1h7l3 3v11H3V1ZM10 1v4h3M5 7h6M5 10h6M5 13h4" />
    </svg>
  );
}

export function Lock({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M3 7h10v8H3zM5 7V4h6v3M7 11v1" />
    </svg>
  );
}

export function Terminal({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M1 2h14v12H1zM4 6l2 2-2 2M8 10h4" />
    </svg>
  );
}

export function Gauge({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M2 13a6 6 0 1 1 12 0H2ZM8 13l4-4" />
    </svg>
  );
}

export function Clock({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M2 2h12v12H2zM8 5v4l3 2" />
    </svg>
  );
}

export function Grid({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" />
    </svg>
  );
}

export function Play({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M4 2h2v12H4zM6 4v2h2v4H6v2h2v-2h2V6h-2V4z" />
    </svg>
  );
}

export function FileLog({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16" {...stroke}>
      <path d="M3 1h6l4 4v10H3V1ZM9 1v4h4M5 8h2M5 11h2M9 8h2M9 11h2" />
    </svg>
  );
}
