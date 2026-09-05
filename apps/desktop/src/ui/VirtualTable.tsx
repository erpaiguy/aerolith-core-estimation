import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { decorateHeader } from "./tableLayout";
import { useTableLayout } from "./useColWidths";

export function VirtualTable({
  rowCount,
  rowHeight = 28,
  height = 560,
  fill = false,
  wrap = true,
  layoutKey,
  header,
  renderRow,
}: {
  rowCount: number;
  rowHeight?: number;
  height?: number;
  fill?: boolean;
  wrap?: boolean;
  layoutKey?: string;
  header: ReactNode;
  renderRow: (index: number) => ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [fillHeight, setFillHeight] = useState(400);
  const layout = useTableLayout(layoutKey ?? "table", {}, 48, rowHeight);
  const head = layoutKey ? decorateHeader(header, layout) : header;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!fill) return;
    const el = scroller.current;
    if (!el) return;
    const measure = () => setFillHeight(Math.max(120, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  const px = fill ? fillHeight : height;
  const minRow = layoutKey ? layout.rowMin : rowHeight;
  const overscan = 8;
  const visible = Math.ceil(px / Math.max(20, minRow));
  const start = Math.max(0, Math.floor(scrollTop / Math.max(20, minRow)) - overscan);
  const end = Math.min(rowCount, start + visible + overscan * 2);
  const padTop = start * minRow;
  const padBottom = Math.max(0, (rowCount - end) * minRow);
  const virtualize = !wrap && (fill || rowCount >= 80);
  const tableStyle = (layoutKey ? layout.tableStyle : { ["--row-min"]: `${rowHeight}px` }) as CSSProperties;

  if (!virtualize) {
    return (
      <div className={`scroll${fill ? " virtual-fill" : ""}`} ref={fill ? scroller : undefined} style={fill ? { height: "100%", overflow: "auto" } : undefined}>
        <table className="data" style={tableStyle}>
          {head}
          <tbody>{Array.from({ length: rowCount }, (_, i) => renderRow(i))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className={`scroll virtual-scroll${fill ? " virtual-fill" : ""}`}
      ref={scroller}
      style={fill ? { height: "100%", overflow: "auto" } : { height: px, overflow: "auto" }}
    >
      <table className="data" style={tableStyle}>
        {head}
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden="true" className="vt-pad">
              <td style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {Array.from({ length: Math.max(0, end - start) }, (_, i) => renderRow(start + i))}
          {padBottom > 0 ? (
            <tr aria-hidden="true" className="vt-pad">
              <td style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
