import { csvCell } from "@/lib/control/csv";
import { maskIps } from "@/lib/control/monitor";

/** Linha do `audit_log` como a tela e o CSV usam. */
export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  objectRef: string;
  details: unknown;
  ipHash: string | null;
}

const IP_SHAPE = /^[0-9a-f:.]+$/i;

/** IP (ou hash de IP) para quem não é admin: endereço cortado; hash só com o começo. */
export function maskIpField(value: string | null, isAdmin: boolean): string {
  if (value === null || value === "") return "";
  if (isAdmin) return value;
  const masked = maskIps(value);
  if (masked !== value) return masked;
  return IP_SHAPE.test(value) && value.length > 8
    ? `${value.slice(0, 8)}…`
    : `${value.slice(0, 4)}…`;
}

/** Detalhes com IPs mascarados (texto do JSON) para quem não é admin. */
export function maskDetails(details: unknown, isAdmin: boolean): unknown {
  if (isAdmin) return details;
  return JSON.parse(maskIps(JSON.stringify(details ?? null))) as unknown;
}

export const AUDIT_CSV_HEAD = ["quando", "ator", "acao", "objeto", "ip", "detalhes"] as const;

/** CSV (BOM, CRLF) da auditoria; células contra fórmula de planilha; IPs mascarados para não admin. */
export function auditCsv(rows: readonly AuditRow[], isAdmin: boolean): string {
  const lines = [
    AUDIT_CSV_HEAD.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.at,
        r.actor,
        r.action,
        maskIps_(r.objectRef, isAdmin),
        maskIpField(r.ipHash, isAdmin),
        maskDetails(r.details, isAdmin),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

const maskIps_ = (text: string, isAdmin: boolean) => (isAdmin ? text : maskIps(text));
