import type { CSSProperties, ReactNode } from "react";
import { colors, font, radius } from "../theme.js";
import { CloseIcon } from "./Icons.js";

const styles: Record<string, CSSProperties> = {
  root: {
    fontFamily: font.ui,
    width: 340,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    color: colors.text,
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border}`,
  },
  title: { fontSize: 12, fontWeight: 600, color: colors.textMuted, letterSpacing: 0.4 },
  closeButton: {
    cursor: "pointer",
    background: "transparent",
    border: "none",
    color: colors.textFaint,
    padding: 4,
    display: "flex",
  },
  body: { padding: 14 },
};

export function WidgetPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title}>TRANSACTION SUPPORT</span>
        <button type="button" aria-label="Close" style={styles.closeButton} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div style={styles.body}>{children}</div>
    </div>
  );
}
