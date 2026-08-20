// Shared helpers for RED-step Drizzle schema-shape tests.
// These introspect the *table definition objects* (via drizzle-orm's own
// getTableColumns/getTableConfig), never a live Postgres connection — this
// keeps these tests in testing.md's fast "unit test / no real DB" tier.
// Real-Postgres verification of the generated migration is a separate,
// later db-migration-verifier step, not this one.
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

// Drizzle types `precision`/`scale` (PgNumeric*) and `length` (PgVarchar) as
// members of their concrete column subclasses, not the shared `PgColumn`
// base — see drizzle-orm/pg-core/columns/{numeric,varchar}.d.ts. These tests
// introspect column definitions generically across every column type in a
// table, so the helper can't statically know which concrete subclass a given
// column is. Widening the return type with these fields as optional mirrors
// the actual runtime shape (present with a `number` value on
// decimal/varchar-family columns, simply absent — not `undefined`-valued,
// just not present — on every other column type), rather than hiding the
// gap behind a wider `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaTestColumn = PgColumn<any> & {
  readonly precision?: number | undefined;
  readonly scale?: number | undefined;
  readonly length?: number | undefined;
};

export function columns(table: PgTable): Record<string, SchemaTestColumn> {
  return getTableColumns(table) as unknown as Record<string, SchemaTestColumn>;
}

export function column(table: PgTable, key: string): SchemaTestColumn {
  const cols = columns(table);
  const col = cols[key];
  if (!col) {
    throw new Error(`Expected column "${key}" not found on table`);
  }
  return col;
}

export function hasColumn(table: PgTable, key: string): boolean {
  return key in columns(table);
}

/** Foreign keys declared via `.references()` and inline table config. */
export function foreignKeys(table: PgTable) {
  const cfg = getTableConfig(table);
  return cfg.foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      columns: ref.columns.map((c) => c.name),
      foreignTable: (ref.foreignTable as unknown as { [key: symbol]: string })[
        Symbol.for("drizzle:Name")
      ],
      foreignColumns: ref.foreignColumns.map((c) => c.name),
    };
  });
}

export function referencesTable(
  table: PgTable,
  columnName: string,
  foreignTableName: string,
  foreignColumnName = "id",
): boolean {
  return foreignKeys(table).some(
    (fk) =>
      fk.columns.includes(columnName) &&
      fk.foreignTable === foreignTableName &&
      fk.foreignColumns.includes(foreignColumnName),
  );
}

export function checkConstraints(table: PgTable) {
  return getTableConfig(table).checks.map((c) => c.name);
}

export function uniqueConstraints(table: PgTable) {
  return getTableConfig(table).uniqueConstraints.map((u) =>
    u.columns.map((c) => c.name),
  );
}

export function tableName(table: PgTable): string {
  return getTableConfig(table).name;
}

/** Composite/explicit primary-key column names declared via `primaryKey({ columns: [...] })`. */
export function compositePrimaryKeyColumns(table: PgTable): string[][] {
  return getTableConfig(table).primaryKeys.map((pk) =>
    pk.columns.map((c) => c.name),
  );
}

/** Index definitions (including partial/unique indexes declared with `.where(...)`). */
export function indexes(table: PgTable) {
  return getTableConfig(table).indexes;
}

/** Finds a declared index whose column set matches `columnNames` (order-sensitive). */
export function findIndexOnColumns(table: PgTable, columnNames: string[]) {
  return indexes(table).find((idx) => {
    const idxCols = idx.config.columns
      .map((c) =>
        c && typeof c === "object" && "name" in c
          ? (c as { name?: string }).name
          : undefined,
      )
      .filter((n): n is string => Boolean(n));
    return (
      idxCols.length === columnNames.length &&
      idxCols.every((n, i) => n === columnNames[i])
    );
  });
}
