import type { ReactNode } from "react";
import { PublisherMark } from "./Brand";
import { AppBar, ThemeButton, useThemeControl } from "./AppBar";
import type { ThemeName } from "../theme";

export function SplashShell({
  status,
  theme,
  onTheme,
  children,
}: {
  status?: string;
  theme?: ThemeName;
  onTheme?: (theme: ThemeName) => void;
  children?: ReactNode;
}) {
  const control = useThemeControl(theme, onTheme);
  const tone = control.theme === "dark" ? "dark" : "light";
  return (
    <div className="app shell login-shell">
      <AppBar />
      <main className="stage login-stage">
        <div className="login-hero">
          <div className="login-side-copy">
            <h1>Price the tender from one file.</h1>
            <p>One job, several bills, totals you can seal.</p>
          </div>
        </div>
        <div className="login-panel">
          {status ? <p className="login-status">{status}</p> : <div className="login-card">{children}</div>}
        </div>
      </main>
      <footer className="status" role="status">
        <span>Sign in to open a tender</span>
        <PublisherMark tone={tone} compact />
        <ThemeButton theme={control.theme} onTheme={control.choose} />
      </footer>
    </div>
  );
}
