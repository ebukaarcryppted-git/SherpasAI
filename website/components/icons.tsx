type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconSlippage({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 17 9 11l4 4L21 7" />
      <path d="M21 7v6M21 7h-6" />
    </svg>
  );
}

export function IconAllowance({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="11" width="16" height="9" rx="0" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <path d="M12 15v2" />
    </svg>
  );
}

export function IconNetwork({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.2 7.2 10 16M15.8 7.2 14 16" />
    </svg>
  );
}

export function IconBridge({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 16v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
      <path d="M5 16v3M9 16v3M15 16v3M19 16v3" />
      <path d="M3 11V8M21 11V8" />
    </svg>
  );
}

export function IconGas({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 21V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v13" />
      <path d="M4 12h10" />
      <path d="M14 8h2l3 3v6a1.5 1.5 0 0 1-3 0v-1" />
      <path d="M2 21h16" />
    </svg>
  );
}

export function IconNonce({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3 22 20H2L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function IconWallet({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-5a2.5 2.5 0 0 1 0-5h5" />
      <path d="M17 14h.01" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
