import { roundQty } from "../../shared/src/decimal.ts";

export type GroupKind = "area" | "length" | "count";
export type LinkCellState = "typed" | "linked" | "drill" | "broken" | "locked";

export interface GroupInput {
  id: string;
  kind: GroupKind;
  /** Multiplier applied after marks and cutout groups. */
  factor: number;
  cutout: boolean;
  parentId: string | null;
}

export interface MarkInput {
  groupId: string;
  length: number | null;
  width: number | null;
  count: number | null;
  deduct: boolean;
  overrideQty: number | null;
}

export interface LinkRead {
  state: LinkCellState;
  title: string;
  groupIds: string[];
  value: number | null;
}

function finite(v: number | null | undefined, fallback: number): number {
  return v == null || !Number.isFinite(v) ? fallback : v;
}

export function markQuantity(kind: GroupKind, mark: MarkInput): number {
  if (mark.overrideQty != null && Number.isFinite(mark.overrideQty)) return mark.overrideQty;
  const count = finite(mark.count, 1);
  if (kind === "count") return count;
  const length = finite(mark.length, 0);
  if (kind === "length") return length * count;
  return length * finite(mark.width, 0) * count;
}

/** Net quantity for one dimension group. Cutout children are subtracted. Cycles yield NaN. */
export function groupQuantity(
  groupId: string,
  groups: GroupInput[],
  marks: MarkInput[],
  seen: Set<string> = new Set(),
): number {
  if (seen.has(groupId)) return Number.NaN;
  const group = groups.find((g) => g.id === groupId);
  if (!group) return Number.NaN;
  const nextSeen = new Set(seen);
  nextSeen.add(groupId);
  let net = 0;
  for (const mark of marks) {
    if (mark.groupId !== group.id) continue;
    const q = markQuantity(group.kind, mark);
    net += mark.deduct ? -q : q;
  }
  for (const child of groups) {
    if (child.parentId !== group.id || !child.cutout) continue;
    const childQty = groupQuantity(child.id, groups, marks, nextSeen);
    if (!Number.isFinite(childQty)) return Number.NaN;
    net -= childQty;
  }
  const factor = Number.isFinite(group.factor) ? group.factor : 1;
  return roundQty(net * factor);
}

export function groupQuantityMap(groups: GroupInput[], marks: MarkInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) map.set(group.id, groupQuantity(group.id, groups, marks));
  return map;
}

export function isDrillGroup(groupId: string, groups: GroupInput[], marks: MarkInput[]): boolean {
  const own = marks.filter((m) => m.groupId === groupId);
  if (own.length > 1 || own.some((m) => m.deduct)) return true;
  return groups.some((g) => g.parentId === groupId && g.cutout);
}

type Tok =
  | { k: "num"; n: number }
  | { k: "id"; id: string }
  | { k: "op"; op: "+" | "-" | "*" | "/" }
  | { k: "lp" }
  | { k: "rp" };

function tokenize(input: string): Tok[] | null {
  const tokens: Tok[] = [];
  let i = 0;
  const s = input.trim();
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ k: "lp" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ k: "rp" });
      i += 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ k: "op", op: c });
      i += 1;
      continue;
    }
    if ((c === "G" || c === "g") && s[i + 1] === ":") {
      i += 2;
      const start = i;
      while (i < s.length && /[A-Za-z0-9_-]/.test(s[i]!)) i += 1;
      if (start === i) return null;
      tokens.push({ k: "id", id: s.slice(start, i) });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const start = i;
      i += 1;
      while (i < s.length && /[0-9.]/.test(s[i]!)) i += 1;
      const n = Number(s.slice(start, i));
      if (!Number.isFinite(n)) return null;
      tokens.push({ k: "num", n });
      continue;
    }
    return null;
  }
  return tokens;
}

export function referencedGroupIds(expression: string): string[] {
  const tokens = tokenize(expression);
  if (!tokens) return [];
  return tokens.filter((t): t is { k: "id"; id: string } => t.k === "id").map((t) => t.id);
}

class Parser {
  private i = 0;
  readonly groupIds: string[] = [];
  readonly missing: string[] = [];

  constructor(
    private readonly tokens: Tok[],
    private readonly qty: Map<string, number>,
  ) {}

  parse(): number {
    const value = this.expr();
    if (this.i !== this.tokens.length) throw new Error("trailing");
    return value;
  }

  private peek(): Tok | undefined {
    return this.tokens[this.i];
  }

  private expr(): number {
    let value = this.term();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.k !== "op" || (tok.op !== "+" && tok.op !== "-")) break;
      this.i += 1;
      const right = this.term();
      value = tok.op === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.k !== "op" || (tok.op !== "*" && tok.op !== "/")) break;
      this.i += 1;
      const right = this.factor();
      if (tok.op === "/" && right === 0) throw new Error("div0");
      value = tok.op === "*" ? value * right : value / right;
    }
    return value;
  }

  private factor(): number {
    const tok = this.peek();
    if (!tok) throw new Error("end");
    if (tok.k === "op" && tok.op === "-") {
      this.i += 1;
      return -this.factor();
    }
    if (tok.k === "num") {
      this.i += 1;
      return tok.n;
    }
    if (tok.k === "id") {
      this.i += 1;
      this.groupIds.push(tok.id);
      const qty = this.qty.get(tok.id);
      if (qty == null || !Number.isFinite(qty)) {
        this.missing.push(tok.id);
        throw new Error("missing");
      }
      return qty;
    }
    if (tok.k === "lp") {
      this.i += 1;
      const value = this.expr();
      const close = this.peek();
      if (!close || close.k !== "rp") throw new Error("paren");
      this.i += 1;
      return value;
    }
    throw new Error("token");
  }
}

export function evaluateLink(
  expression: string,
  quantities: Map<string, number>,
): { ok: boolean; value: number | null; groupIds: string[]; error: string | null } {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) {
    return { ok: false, value: null, groupIds: [], error: "Empty link" };
  }
  const parser = new Parser(tokens, quantities);
  try {
    const value = roundQty(parser.parse());
    if (!Number.isFinite(value)) {
      return { ok: false, value: null, groupIds: parser.groupIds, error: "Link did not resolve" };
    }
    return { ok: true, value, groupIds: parser.groupIds, error: null };
  } catch {
    const missing = parser.missing[0];
    return {
      ok: false,
      value: null,
      groupIds: parser.groupIds.length ? parser.groupIds : referencedGroupIds(expression),
      error: missing ? `Missing dimension group ${missing}` : "Link expression is not valid",
    };
  }
}

export function readQuantityLink(input: {
  expression: string | null | undefined;
  locked: boolean;
  quantities: Map<string, number>;
  groups: GroupInput[];
  marks: MarkInput[];
  groupName: (id: string) => string;
}): LinkRead {
  const expression = input.expression?.trim() ?? "";
  if (!expression) {
    return {
      state: "typed",
      title: "Typed quantity. Posted from bill lines when those lines exist.",
      groupIds: [],
      value: null,
    };
  }
  const evaluated = evaluateLink(expression, input.quantities);
  const names = (evaluated.groupIds.length ? evaluated.groupIds : referencedGroupIds(expression)).map((id) =>
    input.groupName(id),
  );
  const named = names.length ? names.join(", ") : expression;
  if (input.locked) {
    const extra = evaluated.ok ? "" : ` ${evaluated.error ?? "Broken link"}.`;
    return {
      state: "locked",
      title: `Locked quantity. Source: ${named}.${extra} Drawing edits will not overwrite this cell.`,
      groupIds: evaluated.groupIds,
      value: evaluated.value,
    };
  }
  if (!evaluated.ok || evaluated.value == null) {
    return {
      state: "broken",
      title: `${evaluated.error ?? "Broken link"}. Source was ${named}.`,
      groupIds: evaluated.groupIds,
      value: null,
    };
  }
  const drill = evaluated.groupIds.some((id) => isDrillGroup(id, input.groups, input.marks));
  return {
    state: drill ? "drill" : "linked",
    title: drill
      ? `Drill-down quantity from ${named}. Net ${evaluated.value}. Open the group for dimensions and cutouts.`
      : `Linked quantity from ${named}. Net ${evaluated.value}.`,
    groupIds: evaluated.groupIds,
    value: evaluated.value,
  };
}
