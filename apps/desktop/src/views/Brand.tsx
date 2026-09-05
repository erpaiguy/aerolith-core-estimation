type BrandSize = "sm" | "md" | "lg";

const MARK = { sm: 22, md: 32, lg: 44 } as const;

export function BrandMark({ size = 28, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      {tone === "light" ? <rect width="32" height="32" rx="4" fill="#12355B" /> : null}
      <rect x="7" y="8" width="18" height="4" fill="#C9A227" />
      <rect x="7" y="14" width="13" height="4" fill="#C9A227" />
      <rect x="7" y="20" width="8" height="4" fill="#C9A227" />
    </svg>
  );
}

export function BrandLockup({
  size = "md",
  title = "Aerolith Core",
  tone = "light",
}: {
  size?: BrandSize;
  title?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={`brand-lockup brand-lockup-${size} brand-lockup-${tone}`} title={title}>
      <BrandMark size={MARK[size]} tone={tone} />
      <div className="brand-lockup-text">
        <strong>Aerolith</strong>
        <span>Core</span>
      </div>
    </div>
  );
}
