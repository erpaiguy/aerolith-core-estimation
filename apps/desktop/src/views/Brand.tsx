import markDark from "../brand/bidcraft-mark-dark.png";
import markLight from "../brand/bidcraft-mark-light.png";
import aeroDark from "../brand/aerolith-logo-dark.png";
import aeroLight from "../brand/aerolith-logo-light.png";

type BrandSize = "sm" | "md" | "lg";

export function BrandMark({ size = 28, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  return (
    <img
      className="brand-mark"
      src={tone === "dark" ? markDark : markLight}
      width={size}
      height={size}
      alt=""
    />
  );
}

export function BrandLockup({
  size = "md",
  title = "Bid Craft",
  tone = "light",
}: {
  size?: BrandSize;
  title?: string;
  tone?: "light" | "dark";
}) {
  const mark = size === "lg" ? 32 : size === "md" ? 26 : 22;
  return (
    <div className={`brand-lockup brand-lockup-${size} brand-lockup-${tone}`} title={title}>
      <BrandMark size={mark} tone={tone} />
      <span className="brand-lockup-text">
        <strong>{title}</strong>
      </span>
    </div>
  );
}

export function PublisherMark({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  return (
    <p className={`publisher ${tone === "dark" ? "publisher-dark" : ""}`}>
      <span>Published by</span>
      <img
        className="publisher-logo"
        src={tone === "dark" ? aeroDark : aeroLight}
        alt="The Aerolith Core"
        height={compact ? 18 : 28}
      />
    </p>
  );
}
