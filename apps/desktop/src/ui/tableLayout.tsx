import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTableLayout } from "./useColWidths";

export function ResizableTh({
  id,
  label,
  numeric,
  widths,
  onResize,
  onRowResize,
  children,
  className,
  fitTotal,
  extraStyle,
}: {
  id: string;
  label?: ReactNode;
  numeric?: boolean;
  widths: Record<string, number>;
  onResize: (id: string, ev: ReactPointerEvent<HTMLElement>) => void;
  onRowResize?: (ev: ReactPointerEvent<HTMLElement>) => void;
  children?: ReactNode;
  className?: string;
  /** Share of the table. Columns scale with the pane instead of locking a pixel min-width. */
  fitTotal?: number;
  extraStyle?: CSSProperties;
}) {
  const w = widths[id];
  const style: CSSProperties | undefined = {
    ...(w == null
      ? {}
      : fitTotal
        ? { width: `${(w / fitTotal) * 100}%`, minWidth: 0 }
        : { width: w, minWidth: w }),
    ...extraStyle,
  };
  return (
    <th
      className={[numeric ? "num" : "", className].filter(Boolean).join(" ") || undefined}
      style={style}
    >
      {children ?? label}
      <i className="col-resizer" aria-hidden onPointerDown={(e) => onResize(id, e)} />
      {onRowResize ? <i className="row-resizer" aria-hidden onPointerDown={onRowResize} /> : null}
    </th>
  );
}

type Layout = ReturnType<typeof useTableLayout>;
type ThEl = ReactElement<{ children?: ReactNode; className?: string; style?: CSSProperties }>;

function decorateTh(th: ThEl, id: string, index: number, layout: Layout): ReactElement {
  const w = layout.widths[id];
  const prev = th.props.children;
  const style = th.props.style;
  return cloneElement(th, {
    style: w ? { ...style, width: w, minWidth: w } : style,
    children: (
      <>
        {prev}
        <i className="col-resizer" aria-hidden onPointerDown={(e) => layout.startResize(id, e)} />
        {index === 0 ? <i className="row-resizer" aria-hidden onPointerDown={layout.startRowResize} /> : null}
      </>
    ),
  });
}

function decorateThead(thead: ReactElement<{ children?: ReactNode }>, layout: Layout): ReactElement {
  const rows = Children.toArray(thead.props.children);
  return cloneElement(
    thead,
    {},
    rows.map((tr, ri) => {
      if (!isValidElement(tr) || ri !== 0) return tr;
      let col = 0;
      const cells = Children.toArray((tr as ReactElement<{ children?: ReactNode }>).props.children);
      return cloneElement(
        tr as ReactElement<{ children?: ReactNode }>,
        {},
        cells.map((th) => {
          if (!isValidElement(th) || th.type === ResizableTh) return th;
          const id = `c${col++}`;
          return decorateTh(th as ThEl, id, col - 1, layout);
        }),
      );
    }),
  );
}

export function decorateHeader(header: ReactNode, layout: Layout): ReactNode {
  if (!header) return header;
  if (isValidElement(header) && header.type === "thead") {
    return decorateThead(header as ReactElement<{ children?: ReactNode }>, layout);
  }
  if (isValidElement(header)) {
    const kids = Children.toArray((header as ReactElement<{ children?: ReactNode }>).props.children);
    if (!kids.length) return header;
    return cloneElement(
      header,
      {},
      kids.map((kid) =>
        isValidElement(kid) && kid.type === "thead"
          ? decorateThead(kid as ReactElement<{ children?: ReactNode }>, layout)
          : kid,
      ),
    );
  }
  return header;
}

export function DataTable({
  layoutKey,
  children,
  className = "data",
}: {
  layoutKey: string;
  children: ReactNode;
  className?: string;
}) {
  const layout = useTableLayout(layoutKey);
  return (
    <table className={className} style={layout.tableStyle}>
      {Children.map(children, (kid) =>
        isValidElement(kid) && kid.type === "thead"
          ? decorateThead(kid as ReactElement<{ children?: ReactNode }>, layout)
          : kid,
      )}
    </table>
  );
}
