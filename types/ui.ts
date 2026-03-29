/**
 * types/ui.ts
 * ─────────────────────────────────────────────────────────────────────
 * Shared component prop types used across multiple UI components.
 * These live here (not in components/) because they are pure TypeScript
 * interfaces with no React import dependency.
 */

// ─── Generic UI primitives ────────────────────────────────────────────────────

export type Variant  = 'default' | 'outline' | 'ghost' | 'destructive' | 'link';
export type Size     = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ColorKey = 'primary' | 'secondary' | 'accent' | 'muted' | 'destructive';

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavItem {
  label:   string;
  href:    string;
  icon?:   string;       // lucide icon name or emoji
  badge?:  number;       // notification dot / count
  active?: boolean;
}

// ─── Toast / notification ─────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id:      string;
  variant: ToastVariant;
  title:   string;
  body?:   string;
}

// ─── Table ────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key:      keyof T | string;
  label:    string;
  sortable?: boolean;
  align?:   'left' | 'center' | 'right';
  render?:  (row: T) => React.ReactNode;
}

export interface PaginatedResult<T> {
  data:       T[];
  totalCount: number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value:     string;
  label:     string;
  icon?:     string;
  disabled?: boolean;
}

export interface FormFieldError {
  field:   string;
  message: string;
}
