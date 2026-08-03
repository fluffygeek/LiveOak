export const USER_ROLES = ['technician', 'payroll_admin', 'app_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** app_admin is a strict superset of payroll_admin; never duplicate role logic, extend this set. */
export const PAYROLL_ADMIN_ROLES: readonly UserRole[] = ['payroll_admin', 'app_admin'];
