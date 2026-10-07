/**
 * 1 回の実行で使えるサブリクエスト数の予算。
 * Workers 無料プランでは、外部への fetch と D1 の呼び出しを合わせて 1 回の実行につき 50 回までしか使えない
 * (D1 の batch() は 1 回として数えられる)。YouTube クライアントと D1 の両方でこの予算を数え、
 * 同期処理は remaining を見て、上限を超えない範囲で処理を進める
 */
export class RequestBudget {
  private used = 0;

  constructor(readonly limit: number) {}

  get remaining(): number {
    return this.limit - this.used;
  }

  /** 1 回分を使う。D1 の書き込みを途中で止めないよう、ここでは超えても止めない(止めるのは呼び出し側の判断) */
  take(): void {
    this.used++;
  }
}

/** D1 の呼び出し(all / run / first / raw / batch)を予算に数える D1Database を返す */
export function countD1(db: D1Database, budget: RequestBudget): D1Database {
  // batch() には元の D1PreparedStatement を渡す必要があるので、ラップ前の文を覚えておく
  const originals = new WeakMap<object, D1PreparedStatement>();

  const wrap = (stmt: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'bind') return (...args: unknown[]) => wrap(target.bind(...args));
        const value = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return value;
        if (prop === 'all' || prop === 'run' || prop === 'first' || prop === 'raw') {
          return (...args: unknown[]) => {
            budget.take();
            return value.apply(target, args);
          };
        }
        return value.bind(target);
      },
    });
    originals.set(wrapped, stmt);
    return wrapped;
  };

  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (prop === 'batch') {
        return (stmts: D1PreparedStatement[]) => {
          budget.take();
          return target.batch(stmts.map((s) => originals.get(s) ?? s));
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
