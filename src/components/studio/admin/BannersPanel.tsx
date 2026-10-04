"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ChangeEvent } from "react";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { ADS_ADMIN_TEXT, PLACEMENT_STATUS_LABEL, SLOT_NAME } from "@/content/pt-BR/ads-admin";
import { NEVER_SECTIONS } from "@/lib/ads/rules";
import { DISPLAY_SLOTS, SLOT_FORMATS, type DisplaySlot } from "@/lib/ads/slots";
import type { BannerRow, PlacementStatus } from "@/lib/db/queries/ads-admin";
import { formatDate } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { CollapsibleFilters } from "../../ui/CollapsibleFilters";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, CheckList, type AdminReply } from "./AdminStatus";

const T = ADS_ADMIN_TEXT;
type NextStatus = "active" | "paused" | "ended";

export interface BannersPanelProps {
  banners: BannerRow[];
  sections: { slug: string; name: string }[];
  create: (form: FormData) => Promise<AdminReply>;
  setStatus: (i: { id: string; status: NextStatus }) => Promise<AdminReply>;
}

const ALL = "todos";
const SLOT_OPTIONS = DISPLAY_SLOTS.map((s) => ({ value: s, label: `${SLOT_NAME[s]} (${s})` }));

/** Próximas situações possíveis a partir da atual (encerrado não volta). */
function nextOf(status: PlacementStatus): NextStatus[] {
  if (status === "active") return ["paused", "ended"];
  if (status === "ended") return [];
  return ["active", "ended"];
}
const ACTION_LABEL: Record<NextStatus, string> = {
  active: T.banners.resume,
  paused: T.banners.pause,
  ended: T.banners.end,
};

/**
 * Banners (ADS-T4): veiculações com a peça, o anunciante (ou "CityNews (casa)"), período,
 * editorias e situação; pausar, pôr no ar e encerrar; cadastro com envio da imagem.
 */
export function BannersPanel({ banners, sections, create, setStatus }: BannersPanelProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [status, setStatusMsg] = useState<AdminReply | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);
  const [busy, start] = useTransition();
  const allowed = sections.filter((s) => !NEVER_SECTIONS.includes(s.slug));
  const nameOf = (slug: string) => sections.find((s) => s.slug === slug)?.name ?? slug;
  const done = (r: AdminReply) => {
    setStatusMsg(r);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  };
  const shown = filter === ALL ? banners : banners.filter((b) => b.slot === filter);
  return (
    <section aria-labelledby={`${uid}-t`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${uid}-t`} className="type-section text-strong">
          {T.banners.title}
        </h2>
        <Button size="md" icon="plus" onClick={() => setOpen(true)}>
          {T.banners.newTitle}
        </Button>
      </div>
      <CollapsibleFilters activeCount={filter === ALL ? 0 : 1}>
        <Select
          id={`${uid}-f`}
          name="filtro-campo"
          label={T.banners.filter}
          options={[{ value: ALL, label: T.banners.allSlots }, ...SLOT_OPTIONS]}
          value={filter}
          onChange={setFilter}
          className="max-w-xs"
        />
      </CollapsibleFilters>
      <AdminStatus status={status} />
      {shown.length === 0 ? (
        <EmptyState title={T.banners.empty} />
      ) : (
        <AdminTable
          caption={T.banners.title}
          headers={[
            T.form.image,
            T.form.name,
            T.form.slot,
            T.form.startsOn,
            T.form.sections,
            T.form.status,
            ADMIN_TEXT.users.col.actions,
          ]}
          minWidth="min-w-[56rem]"
        >
          {shown.map((b) => (
            <tr key={b.id} className="border-b border-line-subtle last:border-0">
              <td className="px-3 py-3">
                {/* Miniatura da peça (Storage ou /ads); sem otimizador, como no portal. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.imageUrl}
                  alt={b.alt}
                  width={b.width}
                  height={b.height}
                  loading="lazy"
                  className="h-12 w-auto max-w-40 border border-line-subtle object-contain"
                />
              </td>
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {b.name}
                <span className="block type-meta font-normal text-meta">
                  {b.advertiser ?? T.banners.house} · {T.banners.weight(b.weight)}
                </span>
              </th>
              <td className="px-3 py-3 type-body text-body">
                {b.slot}
                <span className="block type-meta text-meta">
                  {b.width}×{b.height}
                </span>
              </td>
              <td className="px-3 py-3 type-body text-body">
                {T.banners.period(formatDate(b.startsOn), formatDate(b.endsOn))}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {b.allowedSections.length === 0
                  ? T.banners.sectionsAll
                  : b.allowedSections.map(nameOf).join(", ")}
              </td>
              <td className="px-3 py-3 type-body text-body">{PLACEMENT_STATUS_LABEL[b.status]}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {nextOf(b.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "ended" ? "danger" : "outline"}
                      disabled={busy}
                      aria-label={`${ACTION_LABEL[s]}: ${b.name}`}
                      onClick={() =>
                        start(async () => done(await setStatus({ id: b.id, status: s })))
                      }
                    >
                      {ACTION_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {open && (
        <BannerDialog
          sections={allowed}
          busy={busy}
          onCancel={() => setOpen(false)}
          onSubmit={(form) => start(async () => done(await create(form)))}
        />
      )}
    </section>
  );
}

function BannerDialog({
  sections,
  busy,
  onCancel,
  onSubmit,
}: {
  sections: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const F = T.form;
  const uid = useId().replace(/:/g, "");
  const [slot, setSlot] = useState<DisplaySlot>("TOP");
  const formats = SLOT_FORMATS[slot];
  const [format, setFormat] = useState(`${formats[0]!.width}x${formats[0]!.height}`);
  const [file, setFile] = useState<File | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [name, setName] = useState("");
  const [advertiser, setAdvertiser] = useState("");
  const [href, setHref] = useState("");
  const [alt, setAlt] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [secs, setSecs] = useState<string[]>([]);
  const [weight, setWeight] = useState("1");
  const [cap, setCap] = useState("");
  const [st, setSt] = useState<"active" | "draft">("active");

  const [fw, fh] = format.split("x").map(Number) as [number, number];
  const sizeOk = !dims || [1, 2].some((k) => dims.w === fw * k && dims.h === fh * k);
  const fileError = !file
    ? undefined
    : file.size > 200 * 1024
      ? T.error.size
      : !sizeOk
        ? T.error.dimensions(fw, fh)
        : undefined;
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(startsOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endsOn) &&
    endsOn >= startsOn;
  const ready =
    !!file &&
    !fileError &&
    dims !== null &&
    name.trim().length >= 2 &&
    /^https:\/\//.test(href.trim()) &&
    alt.trim().length > 0 &&
    dateOk &&
    /^\d+$/.test(weight) &&
    Number(weight) >= 1 &&
    Number(weight) <= 100 &&
    (cap === "" || /^\d+$/.test(cap));

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setDims(null);
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setDims({ w: 0, h: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <Dialog open title={T.banners.newTitle} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          const fd = new FormData();
          fd.set("campo", slot);
          fd.set("formato", format);
          fd.set("imagem", file);
          fd.set("nome", name);
          fd.set("anunciante", advertiser);
          fd.set("link", href);
          fd.set("alt", alt);
          fd.set("inicio", startsOn);
          fd.set("fim", endsOn);
          for (const s of secs) fd.append("editorias", s);
          fd.set("peso", weight);
          fd.set("teto", cap);
          fd.set("situacao", st);
          onSubmit(fd);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${uid}-slot`}
            name="campo"
            label={F.slot}
            options={SLOT_OPTIONS}
            value={slot}
            onChange={(v) => {
              const s = v as DisplaySlot;
              setSlot(s);
              const f = SLOT_FORMATS[s][0]!;
              setFormat(`${f.width}x${f.height}`);
            }}
          />
          <Select
            id={`${uid}-fmt`}
            name="formato"
            label={F.format}
            options={formats.map((f) => ({
              value: `${f.width}x${f.height}`,
              label: `${f.width}×${f.height}`,
            }))}
            value={format}
            onChange={setFormat}
            hint={F.formatHint}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-img`} className="type-meta font-semibold text-strong">
            {F.image}
          </label>
          <input
            id={`${uid}-img`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={pickFile}
            aria-describedby={fileError ? `${uid}-img-erro` : undefined}
            aria-invalid={fileError ? true : undefined}
            className="min-h-tap type-body text-strong file:mr-3 file:min-h-tap file:rounded-md file:border file:border-line-strong file:bg-card-white file:px-3 file:type-body file:text-strong"
          />
          {dims && dims.w > 0 && (
            <p className="type-meta text-meta">
              {dims.w}×{dims.h}
            </p>
          )}
          {fileError && (
            <p id={`${uid}-img-erro`} role="alert" className="type-meta text-danger">
              {fileError}
            </p>
          )}
        </div>
        <TextField
          id={`${uid}-nome`}
          label={F.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-adv`}
          label={F.advertiser}
          hint={F.advertiserHint}
          value={advertiser}
          onChange={(e) => setAdvertiser(e.target.value)}
        />
        <TextField
          id={`${uid}-href`}
          label={F.href}
          type="url"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          required
          error={href && !/^https:\/\//.test(href.trim()) ? T.error.https : undefined}
        />
        <TextField
          id={`${uid}-alt`}
          label={F.alt}
          hint={F.altHint}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-ini`}
            label={F.startsOn}
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            placeholder="AAAA-MM-DD"
            required
          />
          <TextField
            id={`${uid}-fim`}
            label={F.endsOn}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            placeholder="AAAA-MM-DD"
            required
            error={startsOn && endsOn && !dateOk ? T.error.period : undefined}
          />
        </div>
        <CheckList
          label={F.sections}
          options={sections.map((s) => ({ value: s.slug, label: s.name }))}
          value={secs}
          onChange={setSecs}
        />
        <p className="type-meta text-meta">
          {F.sectionsHint} {T.error.forbiddenSection}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-peso`}
            label={F.weight}
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <TextField
            id={`${uid}-teto`}
            label={F.maxPerDay}
            hint={F.maxPerDayHint}
            inputMode="numeric"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </div>
        <Select
          id={`${uid}-st`}
          name="situacao"
          label={F.status}
          options={[
            { value: "active", label: PLACEMENT_STATUS_LABEL.active },
            { value: "draft", label: PLACEMENT_STATUS_LABEL.draft },
          ]}
          value={st}
          onChange={(v) => setSt(v === "draft" ? "draft" : "active")}
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {ADMIN_TEXT.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {busy ? F.sending : F.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
