import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Mounts children into a shadow root attached to a host div. Non-negotiable
 * for something embedded on third-party protocol sites: host page styles
 * must never leak in, and the widget's own styles must never leak out.
 * Both the React-component path and the script-tag embed path render
 * through this same host, so there's exactly one place style isolation can
 * break, not two.
 */
export function ShadowHost({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    if (!hostRef.current || hostRef.current.shadowRoot) return;
    const root = hostRef.current.attachShadow({ mode: "open" });
    setShadowRoot(root);
  }, []);

  return (
    <div ref={hostRef} data-support-widget-host style={{ all: "initial" }}>
      {shadowRoot ? createPortal(children, shadowRoot) : null}
    </div>
  );
}
