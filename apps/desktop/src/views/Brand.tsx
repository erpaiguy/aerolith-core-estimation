import logoDark from "../brand/bidcraft-logo-dark.png";
import logoLight from "../brand/bidcraft-logo-light.png";
import markDark from "../brand/bidcraft-mark-dark.png";
import markLight from "../brand/bidcraft-mark-light.png";
import aeroDark from "../brand/aerolith-logo-dark.png";
import aeroLight from "../brand/aerolith-logo-light.png";

type BrandSize = "sm" | "md" | "lg";

const HEIGHT = { sm: 26, md: 34, lg: 52 } as const;

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
  return (
    <div className={`brand-lockup brand-lockup-${size} brand-lockup-${tone}`} title={title}>
      <img className="brand-logo" src={tone === "dark" ? logoDark : logoLight} alt="Bid Craft" height={HEIGHT[size]} />
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
