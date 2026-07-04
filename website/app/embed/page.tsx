import { Suspense } from "react";
import { DiagnosisWidget } from "@/components/DiagnosisWidget";

/**
 * Embeddable surface for protocols wiring this into their own support
 * widget: <iframe src="https://<your-deploy>/embed" style="border:0;width:100%;height:900px" />
 * Same live tx-diagnosis engine as the main site, without the marketing chrome.
 */
export default function EmbedPage() {
  return (
    <Suspense fallback={null}>
      <DiagnosisWidget />
    </Suspense>
  );
}
