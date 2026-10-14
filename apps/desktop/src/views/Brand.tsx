import { useEffect, useState } from "react";
import logoDark from "../brand/kit/bidcraft/logo-on-dark.svg";
import logoLight from "../brand/kit/bidcraft/logo-on-light.svg";
import iconDark from "../brand/kit/bidcraft/icon-small-on-dark.svg";
import iconLight from "../brand/kit/bidcraft/icon-small-on-light.svg";
import iconFullDark from "../brand/kit/bidcraft/icon-on-dark.svg";
import iconFullLight from "../brand/kit/bidcraft/icon-on-light.svg";
import aeroWordDark from "../brand/kit/aerolith/wordmark-on-dark.svg";
import aeroWordLight from "../brand/kit/aerolith/wordmark-on-light.svg";
import aeroMarkDark from "../brand/kit/aerolith/icon-simple-on-dark.svg";
import aeroMarkLight from "../brand/kit/aerolith/icon-simple-on-light.svg";

type BrandSize = "sm" | "md" | "lg";

/** Paper surfaces flip with the theme. Navy chrome always passes an explicit tone. */
export function useSurfaceTone(): "light" | "dark" {
  const [tone, setTone] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    const sync = () => setTone(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return tone;
}

const LOCKUP_HEIGHT = { sm: 36, md: 40, lg: 48 } as const;

/** Full BidCraft logo (mark + outlined wordmark) from the brand kit. */
export function BrandLockup({
  size = "md",
  tone = "light",
  title = "BidCraft",
}: {
  size?: BrandSize;
  title?: string;
  tone?: "light" | "dark";
}) {
  const height = LOCKUP_HEIGHT[size];
  return (
    <img
      className={`brand-logo brand-logo-${size}`}
      src={tone === "dark" ? logoDark : logoLight}
      alt={title}
      height={height}
    />
  );
}

/** Kit icon. Sizes at or below 32px use the simplified mark so the dashes stay sharp. */
export function BrandMark({ size = 28, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  const small = size <= 32;
  const src = tone === "dark" ? (small ? iconDark : iconFullDark) : small ? iconLight : iconFullLight;
  return <img className="brand-mark" src={src} width={size} height={size} alt="" />;
}

/** Publisher line. The mark and wordmark are the Aerolith kit artwork, not a stand-in typeface. */
export function PublisherMark({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const dark = tone === "dark";
  const mark = compact ? 16 : 22;
  const word = compact ? 12 : 16;
  return (
    <p className={`publisher ${dark ? "publisher-dark" : ""}`}>
      <span>Published by</span>
      <img className="publisher-mark" src={dark ? aeroMarkDark : aeroMarkLight} alt="" width={mark} height={mark} />
      <img
        className="publisher-word"
        src={dark ? aeroWordDark : aeroWordLight}
        alt="The Aerolith Core"
        height={word}
      />
    </p>
  );
}
