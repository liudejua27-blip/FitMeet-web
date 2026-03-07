import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines clsx and tailwind-merge for better className merging
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Security / Sanitization ──────────────────────────────

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML special characters to prevent XSS.
 * Use on any user-provided string before storing or rendering as raw HTML.
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

/**
 * Sanitize user input: trim, escape HTML, enforce max length.
 * Returns the cleaned string.
 */
export function sanitizeInput(raw: string, maxLength = 500): string {
  // Trim whitespace
  let cleaned = raw.trim();
  // Enforce length limit
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  // Escape HTML entities
  cleaned = escapeHtml(cleaned);
  return cleaned;
}

/**
 * Validate a string field: non-empty after trim + within length limits.
 * Returns an error message or null if valid.
 */
export function validateField(
  value: string,
  fieldName: string,
  { minLength = 1, maxLength = 200 }: { minLength?: number; maxLength?: number } = {},
): string | null {
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return `${fieldName}不能为空`;
  }
  if (trimmed.length > maxLength) {
    return `${fieldName}不能超过${maxLength}个字符`;
  }
  return null;
}

/**
 * Format number with K/M suffix
 */
export function formatCount(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}
