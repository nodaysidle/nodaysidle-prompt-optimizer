/** NODAYSIDLE brand mark tile for Prompt Optimizer */
export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#brand-grad)" />
      <path
        d="M32 14 L35.5 25.5 L47 29 L35.5 32.5 L32 44 L28.5 32.5 L17 29 L28.5 25.5 Z"
        fill="#ffffff"
      />
      <circle cx="46" cy="18" r="3" fill="#ffffff" />
      <circle cx="20" cy="42" r="2.5" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}
