import type { ReactNode } from "react";

export function WaveText({
  children,
  className,
}: {
  children: string;
  className?: string;
}): ReactNode {
  const words = children.split(/(\s+)/);
  return (
    <span className={className}>
      {words.map((word, wi) => {
        if (/^\s+$/.test(word)) return word;
        return (
          <span key={wi} className="inline-block whitespace-nowrap">
            {Array.from(word).map((ch, ci) => (
              <span
                key={ci}
                className="inline-block transition-transform duration-300 ease-out will-change-transform hover:-translate-y-2 hover:scale-110"
              >
                {ch}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
