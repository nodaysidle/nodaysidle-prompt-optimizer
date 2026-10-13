import Image from "next/image";

export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <Image
      src="/nodaysidle-icon.svg"
      width={1024}
      height={1024}
      alt=""
      className={className}
      aria-hidden="true"
      unoptimized
    />
  );
}
