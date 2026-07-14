// ──────────────────────────────────────────────────────────────
// גישה מבוססת-תפקיד — נקבעת לפי האימייל של המשתמש המחובר.
// כרגע רק איציק הוא אדמין ורואה הכול; כל שאר המשתמשים רואים
// אך ורק את דפי הביצוע (/sheets).
// ──────────────────────────────────────────────────────────────
export const ADMIN_EMAIL = 'itzik@hagbagag.local'

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL
}
