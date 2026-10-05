"use client";

import { ANALYZE_TEXT } from "@/content/pt-BR/sources-admin";
import { FIELD_TEXT, WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import type { LinkAnalysis } from "@/lib/sources/analyze";
import { Icon } from "../../ui/Icon";

/**
 * Painel "Sugestões da IA" do assistente: avisos de IA indisponível/desligada/dados
 * insuficientes, sinais de qualidade e a justificativa do modelo. Nada aqui entra no formulário:
 * as sugestões só entram pelo "Usar sugestão" de cada campo.
 */
export function AiPanel({ analysis, titleId }: { analysis: LinkAnalysis; titleId: string }) {
  const ai = analysis.aiStatus === "ok" ? analysis.ai : null;
  const notice =
    analysis.aiStatus === "unavailable"
      ? ANALYZE_TEXT.aiUnavailable
      : analysis.aiStatus === "disabled"
        ? WIZARD_TEXT.ai.disabled
        : analysis.aiStatus === "insufficient_data"
          ? WIZARD_TEXT.ai.insufficient
          : null;
  return (
    <aside
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-dashed border-ai bg-ia-soft p-4 sm:p-5"
    >
      <h2 id={titleId} className="type-section text-strong">
        {WIZARD_TEXT.ai.title}
      </h2>
      {notice && <p className="type-body text-strong">{notice}</p>}
      {ai && (
        <>
          <p className="type-meta text-strong">
            {FIELD_TEXT.suggestion.ia}: {FIELD_TEXT.categories} e {FIELD_TEXT.locality} ficam nos
            campos abaixo, com o botão “Usar sugestão”.
          </p>
          <div className="flex flex-col gap-1">
            <p className="type-label text-strong">{WIZARD_TEXT.ai.qualityTitle}</p>
            {ai.qualityFlags.value.length === 0 ? (
              <p className="type-meta text-meta">{WIZARD_TEXT.ai.noQuality}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {ai.qualityFlags.value.map((flag) => (
                  <li key={flag} className="flex items-center gap-1.5 type-body text-strong">
                    <Icon name="circle-alert" size={16} className="text-warn" />
                    {WIZARD_TEXT.quality[flag] ?? flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ai.rationale.value && (
            <div className="flex flex-col gap-1">
              <p className="type-label text-strong">{WIZARD_TEXT.ai.rationale}</p>
              <p className="type-meta text-strong">{ai.rationale.value}</p>
            </div>
          )}
          {analysis.selectorsValidated && (
            <p className="type-meta text-strong">{WIZARD_TEXT.ai.selectorsOk}</p>
          )}
        </>
      )}
    </aside>
  );
}
