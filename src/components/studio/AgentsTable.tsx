import { AI_ADMIN_TEXT as T, agentLabel } from "@/content/pt-BR/control-ai";
import { Button } from "../ui/Button";

export interface AgentsTableRow {
  id: string;
  function: string;
  modelName: string;
  fallbackName: string | null;
  promptVersion: number | null;
  dailyBudgetBrl: number;
  spentTodayBrl: number;
  enabled: boolean;
}

export interface AgentsTableProps {
  rows: AgentsTableRow[];
  /** Quem pode ligar e desligar (admin e operação de IA); os demais só leem. */
  canToggle: boolean;
  /** Server Action do formulário: campos `agentId` e `enabled` ("true" ou "false"). */
  toggle: (formData: FormData) => void | Promise<void>;
}

/**
 * Agentes de IA (O10): modelo, fallback, orçamento do dia, prompt em produção e liga/desliga.
 * O estado nunca depende só de cor: o texto "Ligado" ou "Desligado" acompanha.
 */
export function AgentsTable({ rows, canToggle, toggle }: AgentsTableProps) {
  return (
    <div
      role="region"
      aria-label={T.agentsCaption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className="w-full min-w-[60rem] border-collapse text-left">
        <caption className="sr-only">{T.agentsCaption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              {T.colAgent}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colModel}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colFallback}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colBudget}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colPrompt}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colState}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colActions}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const over = a.spentTodayBrl >= a.dailyBudgetBrl;
            return (
              <tr key={a.id} className="border-b border-line-subtle align-top last:border-b-0">
                <th scope="row" className="px-3 py-3 type-body text-strong">
                  <span className="block font-semibold">{agentLabel(a.id)}</span>
                  <span className="block type-meta text-meta">{a.id}</span>
                  <span className="mt-1 block max-w-[24rem] type-meta text-meta">{a.function}</span>
                </th>
                <td className="px-3 py-3 type-body">{a.modelName}</td>
                <td className="px-3 py-3 type-body">{a.fallbackName ?? T.noFallback}</td>
                <td className="px-3 py-3 type-body tabular-nums">
                  {T.budgetOf(T.brlShort(a.spentTodayBrl), T.brlShort(a.dailyBudgetBrl))}
                  {over && <span className="block font-semibold text-danger">{T.budgetOver}</span>}
                </td>
                <td className="px-3 py-3 type-body">
                  {a.promptVersion === null ? T.noPrompt : T.promptVersion(a.promptVersion)}
                </td>
                <td className="px-3 py-3 type-body font-semibold text-strong">
                  {a.enabled ? T.stateOn : T.stateOff}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      href={`/estudio/control/prompts/${a.id}`}
                      size="sm"
                      variant="outline"
                      aria-label={T.openPromptsNamed(agentLabel(a.id))}
                    >
                      {T.openPrompts}
                    </Button>
                    {canToggle && (
                      <form action={toggle}>
                        <input type="hidden" name="agentId" value={a.id} />
                        <input type="hidden" name="enabled" value={a.enabled ? "false" : "true"} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline-strong"
                          aria-label={
                            a.enabled
                              ? T.turnOffNamed(agentLabel(a.id))
                              : T.turnOnNamed(agentLabel(a.id))
                          }
                        >
                          {a.enabled ? T.turnOff : T.turnOn}
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
