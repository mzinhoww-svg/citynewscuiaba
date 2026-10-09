"use client";

import { useActionState, useId } from "react";
import { AGENDA_AGE_RATINGS, STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { EVENT_FORM_IDLE, VENUE_NONE, type EventFormState } from "@/lib/agenda/form-state";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { DateField } from "../ui/DateField";
import { FormStatus } from "../ui/FormStatus";
import { Select, type SelectOption } from "../ui/Select";
import { SubmitButton } from "../ui/SubmitButton";
import { TextArea } from "../ui/TextArea";
import { TextField } from "../ui/TextField";

/** Lugar do Guia oferecido no seletor (os mesmos candidatos do casamento automático). */
export interface EventVenueOption {
  id: string;
  name: string;
}

export interface EventVenueChoices {
  /** Lugares ativos do Guia; `null` = a leitura falhou (só automático e Nenhum). */
  options: readonly EventVenueOption[] | null;
  /** Vínculo guardado: nome do lugar e se veio do casamento automático. Ausente = sem vínculo. */
  current?: { name: string; auto: boolean } | null;
}

export interface EventFormProps {
  /** Server Action: valida, grava e redireciona; devolve erros por campo quando não salva. */
  action: (state: EventFormState, form: FormData) => Promise<EventFormState>;
  categories: readonly SelectOption[];
  /** Destino de "Voltar para a agenda". */
  cancelHref: string;
  /** Edição: id do evento, enviado num campo escondido. */
  eventId?: string;
  /** Valores guardados (edição), com os nomes dos campos do formulário. */
  initial?: Partial<Record<string, string>>;
  /** Estado inicial (testes e retorno do servidor). */
  initialState?: EventFormState;
  /** Seletor "Local do Guia" (ARD-T4); ausente = sem seletor (vínculo automático). */
  venues?: EventVenueChoices;
}

const F = T.form.fields;

/**
 * Cadastro e edição de evento da Agenda (AGM-T7, spec §5.2). Validação no servidor
 * (`parseEventForm`) com erro por campo e exemplo; o que foi digitado volta preenchido.
 * Funciona sem JavaScript (formulário com Server Action).
 *
 * ```tsx
 * <EventForm action={saveEventAction} categories={cats} cancelHref="/estudio/agenda" />
 * ```
 */
export function EventForm({
  action,
  categories,
  cancelHref,
  eventId,
  initial = {},
  initialState = EVENT_FORM_IDLE,
  venues,
}: EventFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const values = state.status === "idle" ? initial : state.values;
  const val = (k: string) => values[k] ?? "";
  const err = (k: string) => state.errors[k];
  // Lugar guardado fora da lista (inativo ou leitura falhou): entra como "(atual)" e fica
  // escolhido, para o envio nunca trocar o vínculo sem querer.
  const venueValue = val("venueId");
  const storedVenue =
    venueValue &&
    venueValue !== VENUE_NONE &&
    !(venues?.options ?? []).some((v) => v.id === venueValue)
      ? { value: venueValue, label: T.form.venue.stored(venues?.current?.name ?? venueValue) }
      : null;

  return (
    <form
      key={JSON.stringify(values)}
      action={formAction}
      noValidate
      className="flex max-w-read flex-col gap-6"
      aria-describedby={`${uid}-status`}
    >
      <FormStatus
        id={`${uid}-status`}
        tone={state.status === "idle" ? "info" : "error"}
        message={state.status === "idle" ? "" : state.message}
      />
      {eventId && <input type="hidden" name="id" value={eventId} />}
      <TextField
        id={id("title")}
        name="title"
        label={F.title}
        defaultValue={val("title")}
        error={err("title")}
        maxLength={140}
        required
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <DateField
          id={id("startsAt")}
          name="startsAt"
          type="datetime-local"
          label={F.startsAt}
          defaultValue={val("startsAt")}
          error={err("startsAt")}
          required
        />
        <DateField
          id={id("endsAt")}
          name="endsAt"
          type="datetime-local"
          label={F.endsAt}
          defaultValue={val("endsAt")}
          error={err("endsAt")}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TextField
          id={id("venue")}
          name="venue"
          label={F.venue}
          defaultValue={val("venue")}
          error={err("venue")}
          maxLength={160}
          required
        />
        <TextField
          id={id("neighborhood")}
          name="neighborhood"
          label={F.neighborhood}
          defaultValue={val("neighborhood")}
          error={err("neighborhood")}
          maxLength={80}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <TextField
            id={id("price")}
            name="price"
            inputMode="decimal"
            label={F.price}
            hint={T.form.hints.price}
            defaultValue={val("price")}
            error={err("price")}
          />
          <Checkbox
            id={id("priceUnknown")}
            name="priceUnknown"
            value="1"
            label={F.priceUnknown}
            defaultChecked={val("priceUnknown") === "1"}
          />
        </div>
        <Select
          id={id("category")}
          name="category"
          label={F.category}
          placeholder={T.form.categoryPlaceholder}
          options={categories}
          defaultValue={val("category")}
          error={err("category")}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Select
          id={id("ageRating")}
          name="ageRating"
          label={F.ageRating}
          options={AGENDA_AGE_RATINGS.map((a) => ({ value: a, label: T.form.ages[a] }))}
          defaultValue={val("ageRating") || "livre"}
          error={err("ageRating")}
        />
        <TextField
          id={id("accessibility")}
          name="accessibility"
          label={F.accessibility}
          hint={T.form.hints.accessibility}
          defaultValue={val("accessibility")}
          error={err("accessibility")}
          maxLength={200}
        />
      </div>
      <TextField
        id={id("organizer")}
        name="organizer"
        label={F.organizer}
        hint={T.form.hints.organizer}
        defaultValue={val("organizer")}
        error={err("organizer")}
        maxLength={160}
      />
      {venues && (
        <div className="flex flex-col gap-2">
          <Select
            id={id("venueId")}
            name="venueId"
            label={F.venueId}
            hint={T.form.hints.venueId}
            options={[
              { value: "", label: T.form.venue.auto },
              ...(storedVenue ? [storedVenue] : []),
              ...(venues.options ?? []).map((v) => ({ value: v.id, label: v.name })),
              { value: VENUE_NONE, label: T.form.venue.none },
            ]}
            defaultValue={venueValue}
          />
          {eventId && (
            <p className="type-meta text-meta" data-testid="venue-current">
              {venues.current
                ? T.form.venue.current(venues.current.name, venues.current.auto)
                : T.form.venue.currentNone}
            </p>
          )}
          {venues.options === null ? (
            <p className="type-meta text-danger" role="alert">
              {T.form.venue.error}
            </p>
          ) : venues.options.length === 0 ? (
            <p className="type-meta text-meta">{T.form.venue.empty}</p>
          ) : null}
        </div>
      )}
      <TextField
        id={id("link")}
        name="link"
        type="url"
        inputMode="url"
        label={F.link}
        hint={T.form.hints.link}
        defaultValue={val("link")}
        error={err("link")}
      />
      <TextArea
        id={id("description")}
        name="description"
        label={F.description}
        hint={T.form.hints.description}
        rows={3}
        maxLength={300}
        defaultValue={val("description")}
        error={err("description")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="md" pendingLabel={T.form.saving}>
          {T.form.save}
        </SubmitButton>
        <Button href={cancelHref} size="md" variant="outline">
          {T.form.cancel}
        </Button>
      </div>
    </form>
  );
}
