import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { FailureModes } from "@/components/FailureModes";
import { HowItWorks } from "@/components/HowItWorks";
import { DiagnosisWidget } from "@/components/DiagnosisWidget";
import { ApprovalChecker } from "@/components/ApprovalChecker";
import { BridgeChecker } from "@/components/BridgeChecker";
import { Composability } from "@/components/Composability";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Suspense fallback={null}>
          <DiagnosisWidget />
        </Suspense>
        <ApprovalChecker />
        <BridgeChecker />
        <FailureModes />
        <Composability />
      </main>
      <Footer />
    </>
  );
}
