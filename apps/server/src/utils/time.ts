export function nowIso(): string {
  return new Date().toISOString();
}

export function nowYmd(): { year: string; month: string; day: string } {
  const d = new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { year, month, day };
}
