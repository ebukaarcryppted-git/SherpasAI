import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Browser-tab favicon (Next.js 16 `app/icon.tsx` file convention). The raw
 * public/logo.png is white-on-transparent, which renders invisibly against
 * a browser's default light-colored tab bar — so we composite it here onto
 * the site's own dark background at build time. Generated statically, cached
 * per the app-icons docs.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  const logoBytes = readFileSync(join(process.cwd(), "public", "logo.png"));
  const logoDataUri = `data:image/png;base64,${logoBytes.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          borderRadius: 12,
        }}
      >
        {}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUri}
          width={52}
          height={52}
          alt=""
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size }
  );
}
