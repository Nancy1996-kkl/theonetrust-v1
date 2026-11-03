import { useId, type ReactNode } from 'react';
import { useUiStrings } from './ui-strings.ts';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-align numbers and amounts so digits line up. */
  align?: 'start' | 'end';
  /** Use this column's cell as the row header (<th scope="row">). */
  rowHeader?: boolean;
}

export interface DataTableProps<Row> {
  caption: ReactNode;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown inside the table body when there are no rows (e.g. a StateBlock). */
  empty: ReactNode;
  /** Visually hide the caption (it is still the table's accessible name). */
  hideCaption?: boolean;
  className?: string;
}

/**
 * Semantic data table for the owner dashboard. The scroll wrapper is focusable and named by
 * the caption, so keyboard users can scroll wide tables on small screens (WCAG 2.1.1).
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  hideCaption = false,
  className,
}: DataTableProps<Row>) {
  const strings = useUiStrings();
  const captionId = useId();
  const hintId = useId();
  return (
    <div className={['ui-table', className].filter(Boolean).join(' ')}>
      <div
        className="ui-table__scroll"
        role="region"
        aria-labelledby={captionId}
        aria-describedby={hintId}
        // A scrollable region must be keyboard reachable.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <table className="ui-table__table">
          <caption id={captionId} className={hideCaption ? 'visually-hidden' : 'ui-table__caption'}>
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={column.align === 'end' ? 'ui-table__cell--end' : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="ui-table__empty">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => {
                    const cls = column.align === 'end' ? 'ui-table__cell--end' : undefined;
                    return column.rowHeader ? (
                      <th key={column.key} scope="row" className={cls}>
                        {column.cell(row)}
                      </th>
                    ) : (
                      <td key={column.key} className={cls}>
                        {column.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p id={hintId} className="visually-hidden">
        {strings.tableScrollHint}
      </p>
    </div>
  );
}
