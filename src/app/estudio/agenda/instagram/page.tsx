import type { Metadata } from "next";
import {
  Button,
  Checkbox,
  EmptyState,
  InlineAlert,
  Panel,
  SubmitButton,
  TextField,
} from "@/components";
import { CopyCaption, StudioScreen } from "@/components/estudio";
import { STUDIO_SOCIAL_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { requireRole } from "@/lib/auth/require-role";
import { addDays, formatDateTime } from "@/lib/format/date";
import type { StoredPackage } from "@/lib/social/build-package";
import type { PackageItem } from "@/lib/social/items";
import { weekLabel } from "@/lib/social/items";
import { weekRange } from "@/lib/social/pick-week";
import { isReadyToApprove, readSocialPackage, weekStartOf } from "@/lib/studio/social-package";
import { AgendaTabs } from "../AgendaTabs";
import {
  approveSocialAction,
  discardSocialAction,
  publishSocialAction,
  regenerateSocialAction,
} from "./actions";

export const metadata: Metadata = { title: T.metaTitle };
export const dynamic = "force-dynamic";

const BASE = "/estudio/agenda/instagram";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function WeekField({ week }: { week: string }) {
  return <input type="hidden" name="semana" value={week} />;
}

function RegenerateForm({
  week,
  pkg,
  label,
}: {
  week: string;
  pkg: StoredPackage | null;
  label: string;
}) {
  const editable = !pkg || pkg.status === "draft" || pkg.status === "discarded";
  if (!editable) return null;
  const items = pkg?.items ?? [];
  return (
    <form action={regenerateSocialAction} className="flex flex-col gap-3">
      <WeekField week={week} />
      {items.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="type-section text-strong">{T.eventsTitle}</legend>
          <p className="type-meta text-meta">{T.removeHint}</p>
          {items.map((it) => (
            <Checkbox
              key={it.eventId}
              name="tirar"
              value={it.eventId}
              label={T.removeLabel(it.title)}
              hint={`${it.dayLabel} · ${it.time} · ${it.venue}`}
            />
          ))}
        </fieldset>
      )}
      {(pkg?.excluded.length ?? 0) > 0 && (
        <Checkbox
          name="devolver"
          value="1"
          label={T.restore}
          hint={T.excludedCount(pkg?.excluded.length ?? 0)}
        />
      )}
      <div>
        <SubmitButton size="md" variant="secondary" icon="refresh-cw" pendingLabel={T.regenerating}>
          {label}
        </SubmitButton>
      </div>
    </form>
  );
}

function slideWhat(pkg: StoredPackage, i: number): string {
  if (i === 0) return T.slideCover;
  if (i === pkg.assets.length - 1) return T.slideClosing;
  return pkg.items[i - 1]?.title ?? "";
}

/** Pacote "Agenda da semana" do Instagram no Estúdio (ARD-T6, spec 2026-10-08 §7). */
export default async function InstagramPackagePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireRole("article.publish", { section: "agenda" }, { next: BASE });
  const sp = await searchParams;
  const asked = weekStartOf(one(sp.semana));
  const current = weekStartOf(null) ?? "";
  const week = asked ?? current;
  const label = weekLabel(weekRange(new Date(), week));
  const done = T.done[one(sp.feito) ?? ""];
  const failed = one(sp.erro);
  const failedText = failed ? (T.errors[failed] ?? T.errors.failed) : null;

  let pkg: StoredPackage | null = null;
  let revoked: PackageItem[] = [];
  let loadFailed = false;
  try {
    const r = await readSocialPackage(week);
    if (r.ok) {
      pkg = r.value.pkg;
      revoked = r.value.revokedImages;
    } else loadFailed = true;
  } catch {
    loadFailed = true;
  }

  const weekHref = (w: string) => `${BASE}?semana=${w}`;
  const slideSrc = (i: number) =>
    `${BASE}/slide/${i + 1}?semana=${week}&v=${encodeURIComponent(pkg?.generatedAt ?? "")}`;
  const zipHref = `${BASE}/zip?semana=${week}`;

  return (
    <StudioScreen title={T.title} intro={<p className="type-body text-meta">{T.intro}</p>}>
      <AgendaTabs current="instagram" />
      <nav aria-label={T.weekNav} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="type-section text-strong">{T.weekOf(label)}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            href={weekHref(addDays(week, -7))}
            size="sm"
            variant="outline"
            icon="chevron-left"
          >
            {T.previousWeek}
          </Button>
          {week !== current && (
            <Button href={weekHref(current)} size="sm" variant="outline">
              {T.currentWeek}
            </Button>
          )}
          <Button
            href={weekHref(addDays(week, 7))}
            size="sm"
            variant="outline"
            iconRight="chevron-right"
          >
            {T.nextWeek}
          </Button>
        </div>
      </nav>
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {failedText && (
        <InlineAlert tone="error" role="alert">
          {failedText}
        </InlineAlert>
      )}

      {loadFailed ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          as="h2"
          title={T.loadError.title}
          actions={
            <Button href={weekHref(week)} size="md" variant="outline" icon="refresh-cw">
              {T.loadError.retry}
            </Button>
          }
        >
          {T.loadError.body}
        </EmptyState>
      ) : pkg === null ? (
        <EmptyState
          as="h2"
          icon="calendar"
          title={T.notBuilt.title}
          actions={<RegenerateForm week={week} pkg={null} label={T.build} />}
        >
          {T.notBuilt.body}
        </EmptyState>
      ) : (
        <PackageView
          pkg={pkg}
          revoked={revoked}
          week={week}
          slideSrc={slideSrc}
          zipHref={zipHref}
        />
      )}
    </StudioScreen>
  );
}

function PackageView({
  pkg,
  revoked,
  week,
  slideSrc,
  zipHref,
}: {
  pkg: StoredPackage;
  revoked: PackageItem[];
  week: string;
  slideSrc: (i: number) => string;
  zipHref: string;
}) {
  const clamped = pkg.items.filter((it) => it.titleClamped);
  const revokedTitles = revoked.map((it) => it.title).join("; ");
  const revokedText =
    revoked.length === 0
      ? null
      : pkg.status === "published"
        ? T.revoked.published(revokedTitles)
        : pkg.status === "approved"
          ? T.revoked.approved(revokedTitles)
          : pkg.status === "draft"
            ? T.revoked.draft(revokedTitles)
            : null;
  return (
    <div className="flex flex-col gap-6">
      <Panel aria-labelledby="pacote-situacao" pad="md" className="flex flex-col gap-3">
        <h2 id="pacote-situacao" className="type-section text-strong">
          {T.facts.status}: <span data-testid="social-status">{T.status[pkg.status]}</span>
        </h2>
        <p className="type-body text-meta">{T.statusHint[pkg.status]}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 type-meta sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-meta">{T.facts.events}</dt>
            <dd className="text-strong">{pkg.items.length}</dd>
          </div>
          {pkg.generatedAt && (
            <div>
              <dt className="text-meta">{T.facts.generatedAt}</dt>
              <dd className="text-strong">{formatDateTime(pkg.generatedAt)}</dd>
            </div>
          )}
          {pkg.approvedAt && (
            <div>
              <dt className="text-meta">{T.facts.approvedAt}</dt>
              <dd className="text-strong">{formatDateTime(pkg.approvedAt)}</dd>
            </div>
          )}
          {pkg.publishedUrl && (
            <div className="min-w-0">
              <dt className="text-meta">{T.facts.publishedUrl}</dt>
              <dd className="break-all">
                <a
                  href={pkg.publishedUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="font-medium text-link underline"
                >
                  {pkg.publishedUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
        {pkg.error && (
          <InlineAlert tone="error" role="alert">
            {T.failed(pkg.error)}
          </InlineAlert>
        )}
        {revokedText && (
          <InlineAlert tone="error" role="alert">
            <span data-testid="social-revoked">{revokedText}</span>
          </InlineAlert>
        )}
      </Panel>

      <section aria-labelledby="pacote-acoes" className="flex flex-col gap-4">
        <h2 id="pacote-acoes" className="type-section text-strong">
          {T.actionsTitle}
        </h2>
        <div className="flex flex-wrap items-start gap-3">
          {pkg.status === "draft" && isReadyToApprove(pkg) && revoked.length === 0 && (
            <form action={approveSocialAction} className="flex flex-col gap-2">
              <WeekField week={week} />
              <input type="hidden" name="geracao" value={pkg.generatedAt ?? ""} />
              <SubmitButton size="md" icon="check" pendingLabel={T.approving}>
                {T.approve}
              </SubmitButton>
            </form>
          )}
          {(pkg.status === "approved" || pkg.status === "published") && (
            <Button href={zipHref} download size="md" icon="download">
              {T.downloadZip}
            </Button>
          )}
          {(pkg.status === "draft" || pkg.status === "approved") && (
            <form action={discardSocialAction}>
              <WeekField week={week} />
              <SubmitButton size="md" variant="outline" icon="trash-2" pendingLabel={T.discarding}>
                {T.discard}
              </SubmitButton>
            </form>
          )}
        </div>
        {pkg.status === "draft" && clamped.length > 0 && (
          <InlineAlert tone="warn" role="status">
            <span data-testid="social-clamped">
              {T.clamped(clamped.map((it) => it.title).join("; "))}
            </span>
          </InlineAlert>
        )}
        <p className="type-meta text-meta">
          {pkg.status === "approved" || pkg.status === "published" ? T.zipHint : T.zipLocked}
        </p>
        {pkg.status === "approved" && (
          <form action={publishSocialAction} className="flex max-w-xl flex-col gap-3">
            <WeekField week={week} />
            <TextField
              id="post-url"
              name="url"
              type="url"
              inputMode="url"
              label={T.publishUrl}
              hint={T.publishHint}
              required
              maxLength={300}
            />
            <div>
              <SubmitButton size="md" variant="secondary" pendingLabel={T.publishing}>
                {T.publish}
              </SubmitButton>
            </div>
          </form>
        )}
      </section>

      {pkg.items.length === 0 ? (
        <EmptyState
          as="h2"
          icon="calendar"
          title={T.empty.title}
          actions={<RegenerateForm week={week} pkg={pkg} label={T.regenerate} />}
        >
          {T.empty.body}
        </EmptyState>
      ) : (
        <>
          {pkg.assets.length > 0 && (
            <section aria-labelledby="pacote-slides" className="flex flex-col gap-3">
              <h2 id="pacote-slides" className="type-section text-strong">
                {T.slidesTitle}
              </h2>
              <p className="type-meta text-meta">{T.slidesHint}</p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {pkg.assets.map((path, i) => (
                  <li key={path}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- PNG privado, servido pela rota do Estúdio com a sessão */}
                    <img
                      src={slideSrc(i)}
                      alt={T.slideAlt(i + 1, pkg.assets.length, slideWhat(pkg, i))}
                      width={1080}
                      height={1350}
                      loading="lazy"
                      className="h-auto w-full rounded-md border border-line-subtle"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="pacote-legenda" className="flex flex-col gap-3">
            <h2 id="pacote-legenda" className="type-section text-strong">
              {T.captionTitle}
            </h2>
            <CopyCaption
              id="legenda"
              label={T.captionLabel}
              caption={pkg.caption}
              hint={T.captionCount(pkg.caption.length)}
              copyLabel={T.copy}
              copiedLabel={T.copied}
              failedLabel={T.copyFailed}
            />
          </section>

          <section aria-labelledby="pacote-creditos" className="flex flex-col gap-3">
            <h2 id="pacote-creditos" className="type-section text-strong">
              {T.creditsTitle}
            </h2>
            <ul className="flex flex-col gap-2 type-body">
              {pkg.items.map((it) => (
                <li key={it.eventId} className="flex flex-col">
                  <span className="text-strong">{it.title}</span>
                  <span className="type-meta text-meta">
                    {it.image ? T.photoCredit(it.image.credit) : T.noPhoto}
                    {it.origin ? ` · ${it.origin}` : ""}
                  </span>
                  {it.image?.originUrl && (
                    <a
                      href={it.image.originUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                      aria-label={`${T.viewOriginal}: ${it.title}`}
                      className="w-fit type-meta font-medium text-link underline"
                    >
                      {T.viewOriginal}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <RegenerateForm week={week} pkg={pkg} label={T.regenerate} />
        </>
      )}
    </div>
  );
}
