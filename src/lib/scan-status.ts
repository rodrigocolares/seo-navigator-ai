// Shared scan status helpers — keep UI + polling logic in sync.
export const ACTIVE_SCAN_STATUSES = ["queued", "running", "crawling", "analyzing"] as const;
export const FINAL_SCAN_STATUSES = ["completed", "failed", "cancelled"] as const;

export type ScanStatus =
  | (typeof ACTIVE_SCAN_STATUSES)[number]
  | (typeof FINAL_SCAN_STATUSES)[number]
  | string;

export function isActiveStatus(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_SCAN_STATUSES as readonly string[]).includes(status);
}

export function isFinalStatus(status: string | null | undefined): boolean {
  return !!status && (FINAL_SCAN_STATUSES as readonly string[]).includes(status);
}

export const STATUS_LABELS_PT: Record<string, string> = {
  queued: "Na fila",
  running: "Em andamento",
  crawling: "Rastreando",
  analyzing: "IA analisando",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS_PT[status] ?? status;
}
