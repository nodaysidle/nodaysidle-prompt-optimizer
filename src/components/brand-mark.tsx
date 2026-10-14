/** NODAYSIDLE brand mark tile for Prompt Optimizer */
export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="silver-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#e2e8f0" />
          <stop offset="70%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#000000" />
      <path
        d="M18 47V17h7.5l13.5 20.25V17H46v30h-7.5L25 26.75V47H18z"
        fill="url(#silver-brand-grad)"
      />
    </svg>
  );
}
