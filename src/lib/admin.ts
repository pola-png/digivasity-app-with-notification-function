const ADMIN_EMAIL_ALLOWLIST = new Set([
  'ubyytech2023@gmail.com',
  'olamilekanobetter@gmail.com',
  'ezekielxap@gmail.com',
  'info@digiskiskillsconsult.com',
  'ubong.udoka@digiskiskillsconsult.com',
]);

export function isAllowlistedAdminEmail(email?: string | null) {
  return !!email && ADMIN_EMAIL_ALLOWLIST.has(email.toLowerCase());
}

export function isAdminUserLike(user: { role?: string; admin?: boolean; email?: string | null; emailVerified?: boolean | null }) {
  return user.role === 'admin' || user.admin === true || isAllowlistedAdminEmail(user.email);
}
