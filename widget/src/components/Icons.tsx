import type { CSSProperties } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

/** The collapsed-trigger icon — a wrench/support glyph, deliberately not a chat bubble or sparkle. */
export function SupportIcon({ size = 20, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 2.1-2.1Z" />
    </svg>
  );
}

export function CloseIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function AlertIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <path d="M12 3 22 20H2L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function ClockIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 13, style }: IconProps) {
  return (
    <svg {...base} width={size} height={size} style={style}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}
