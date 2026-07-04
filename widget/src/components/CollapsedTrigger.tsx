import type { CSSProperties } from "react";
import { colors, radius } from "../theme.js";
import { SupportIcon } from "./Icons.js";

const style: CSSProperties = {
  cursor: "pointer",
  width: 44,
  height: 44,
  borderRadius: radius.lg,
  border: `1px solid ${colors.borderStrong}`,
  background: colors.bgElevated,
  color: colors.textMuted,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Small, quiet trigger — deliberately doesn't compete with the host dApp's own UI. */
export function CollapsedTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Open transaction support" style={style} onClick={onClick}>
      <SupportIcon />
    </button>
  );
}
