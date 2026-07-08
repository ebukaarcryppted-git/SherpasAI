import Image from "next/image";

export function SherpasLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={514}
      height={466}
      priority
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
