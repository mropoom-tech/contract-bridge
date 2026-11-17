/** Header set ONLY by our Worker after verifying the session; the Worker builds a fresh request so client copies never reach the DO. */
export const INTERNAL_USER_HEADER = 'X-Bridge-Internal-User-Id';
