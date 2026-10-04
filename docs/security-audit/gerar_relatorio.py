#!/usr/bin/env python3
"""Gera docs/security-audit/relatorio-auditoria-seguranca.pdf a partir de achados.json.

Uso (ambiente isolado, nada global):
    python3 -m venv docs/security-audit/.venv
    docs/security-audit/.venv/bin/pip install reportlab matplotlib
    docs/security-audit/.venv/bin/python docs/security-audit/gerar_relatorio.py
"""
from __future__ import annotations

import io
import json
from collections import Counter
from pathlib import Path
from xml.sax.saxutils import escape

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.enums import TA_CENTER  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import cm  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    CondPageBreak,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "achados.json").read_text(encoding="utf-8"))
OUT = HERE / "relatorio-auditoria-seguranca.pdf"

SEV = {
    "crítica": "#B91C1C",
    "alta": "#EA580C",
    "média": "#D97706",
    "baixa": "#2563EB",
    "informativa": "#6B7280",
}
SEV_ORDER = list(SEV)
STRONG = "#059669"
INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#4B5563")
LINE = colors.HexColor("#E5E7EB")

ss = getSampleStyleSheet()
S = {
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=18,
                         leading=22, textColor=INK, spaceBefore=4, spaceAfter=10),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=13,
                         leading=16, textColor=INK, spaceBefore=10, spaceAfter=6),
    "body": ParagraphStyle("body", parent=ss["BodyText"], fontName="Helvetica", fontSize=9.5,
                           leading=13, textColor=INK, spaceAfter=5),
    "small": ParagraphStyle("small", parent=ss["BodyText"], fontName="Helvetica", fontSize=8,
                            leading=10.5, textColor=INK),
    "cell": ParagraphStyle("cell", parent=ss["BodyText"], fontName="Helvetica", fontSize=8,
                           leading=10.5, textColor=INK, wordWrap="CJK"),
    "cellb": ParagraphStyle("cellb", parent=ss["BodyText"], fontName="Helvetica-Bold",
                            fontSize=8, leading=10.5, textColor=colors.white),
    "chip": ParagraphStyle("chip", fontName="Helvetica-Bold", fontSize=6.6, leading=9,
                           textColor=colors.white, alignment=TA_CENTER),
    "path": ParagraphStyle("path", parent=ss["BodyText"], fontName="Helvetica", fontSize=7,
                           leading=9.5, textColor=INK, wordWrap="CJK"),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=7, leading=8.6, textColor=INK),
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=26, leading=31,
                            textColor=INK, spaceAfter=14),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=11, leading=15, textColor=MUTED),
}

W = A4[0] - 4 * cm  # largura útil com margens de 2 cm


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, S[style])


def t(text: str) -> str:
    """Escapa texto puro para Paragraph e marca `código` com fonte mono."""
    out, parts = [], escape(text).split("`")
    for i, part in enumerate(parts):
        out.append(f'<font name="Courier">{part}</font>' if i % 2 else part)
    return "".join(out)


def chip(sev: str) -> Table:
    tab = Table([[Paragraph(sev.upper(), S["chip"])]], colWidths=[2.3 * cm], rowHeights=[0.5 * cm])
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SEV[sev])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return tab


def fig_to_image(fig, width_cm: float) -> Image:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    img = Image(buf)
    ratio = img.imageHeight / img.imageWidth
    img.drawWidth = width_cm * cm
    img.drawHeight = width_cm * cm * ratio
    return img


def donut(counts: Counter) -> Image:
    labels = [s for s in SEV_ORDER if counts.get(s)]
    vals = [counts[s] for s in labels]
    fig, ax = plt.subplots(figsize=(4.2, 4.2))
    wedges, _ = ax.pie(vals, colors=[SEV[s] for s in labels], startangle=90, counterclock=False,
                       wedgeprops=dict(width=0.38, edgecolor="white", linewidth=2))
    ax.text(0, 0.08, str(sum(vals)), ha="center", va="center", fontsize=28, weight="bold",
            color="#111827")
    ax.text(0, -0.2, "achados", ha="center", va="center", fontsize=11, color="#4B5563")
    ax.legend(wedges, [f"{s.capitalize()} ({counts[s]})" for s in labels], loc="upper center",
              bbox_to_anchor=(0.5, -0.02), ncol=3, frameon=False, fontsize=9)
    ax.set_title("Achados por severidade", fontsize=12, weight="bold", color="#111827")
    ax.axis("equal")
    return fig_to_image(fig, 8.2)


def bars(findings: list[dict], categories: list[dict]) -> Image:
    fig, ax = plt.subplots(figsize=(8.2, 3.6))
    names = [c["curto"] for c in categories]
    left = [0] * len(categories)
    for sev in SEV_ORDER:
        vals = [sum(1 for f in findings if f["categoria"] == c["id"] and f["severidade"] == sev)
                for c in categories]
        if any(vals):
            ax.barh(names, vals, left=left, color=SEV[sev], label=sev.capitalize(), height=0.6)
            left = [a + b for a, b in zip(left, vals)]
    strengths = [len(c.get("pontos_fortes", [])) for c in categories]
    ax.barh(names, strengths, left=left, color=STRONG, label="Ponto forte", height=0.6, alpha=0.9)
    ax.invert_yaxis()
    ax.set_xlabel("Quantidade", fontsize=9)
    ax.set_title("Achados e pontos fortes por categoria", fontsize=12, weight="bold",
                 color="#111827")
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(labelsize=9)
    ax.xaxis.get_major_locator().set_params(integer=True)
    ax.legend(fontsize=8, frameon=False, loc="upper left", bbox_to_anchor=(1.01, 1))
    return fig_to_image(fig, 15.5)


def table(rows, widths, header_bg="#111827", zebra=True) -> Table:
    tab = Table(rows, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_bg)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if zebra:
        for i in range(1, len(rows)):
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F9FAFB")))
    tab.setStyle(TableStyle(style))
    return tab


def on_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(2 * cm, A4[1] - 1.3 * cm,
                          f"Relatório de Auditoria de Segurança — {DATA['projeto']}")
        canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.3 * cm, DATA["data"])
        canvas.setStrokeColor(LINE)
        canvas.line(2 * cm, A4[1] - 1.45 * cm, A4[0] - 2 * cm, A4[1] - 1.45 * cm)
        canvas.line(2 * cm, 1.45 * cm, A4[0] - 2 * cm, 1.45 * cm)
        canvas.drawString(2 * cm, 1.0 * cm, "Confidencial · uso interno")
        canvas.drawRightString(A4[0] - 2 * cm, 1.0 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build() -> None:
    cats = DATA["categorias"]
    cat_by_id = {c["id"]: c for c in cats}
    findings = sorted(DATA["achados"], key=lambda f: (SEV_ORDER.index(f["severidade"]), f["id"]))
    counts = Counter(f["severidade"] for f in findings)
    story = []

    # a) Capa
    story += [Spacer(1, 3 * cm),
              p("AUDITORIA DE SEGURANÇA · SAAS", "sub"), Spacer(1, 0.3 * cm),
              p(t(f"Relatório de Auditoria de Segurança — {DATA['projeto']}"), "title"),
              p(t(f"Data: {DATA['data']} · Branch: `{DATA['branch']}` · Commit: `{DATA['commit']}`"),
                "sub"),
              Spacer(1, 0.8 * cm)]
    cover = [[Paragraph("<b>Escopo auditado</b>", S["cellb"])]] + [[p(t(x), "cell")] for x in DATA["escopo"]]
    story += [table(cover, [W]), PageBreak()]
    story += [p("Stack detectada", "h1"), p(t(DATA["stack"]))]
    story += [p("<b>Nota metodológica</b>", "h2")]
    meth = [[Paragraph("<b>Categoria</b>", S["cellb"]), Paragraph("<b>Como foi mapeada para esta stack</b>", S["cellb"])]]
    meth += [[p(t(c["nome"]), "cell"), p(t(c["metodo"]), "cell")] for c in cats]
    story += [table(meth, [4.2 * cm, W - 4.2 * cm]), PageBreak()]

    # b) Resumo executivo
    story += [p("Resumo executivo", "h1"), p(t(DATA["resumo"]))]
    tot = [[Paragraph(f"<b>{s.capitalize()}</b>", S["cellb"]) for s in SEV_ORDER]
           + [Paragraph("<b>Pontos fortes</b>", S["cellb"])]]
    tot.append([p(f"<b>{counts.get(s, 0)}</b>", "body") for s in SEV_ORDER]
               + [p(f"<b>{sum(len(c.get('pontos_fortes', [])) for c in cats)}</b>", "body")])
    tt = Table(tot, colWidths=[W / 6] * 6)
    tt.setStyle(TableStyle([
        *[("BACKGROUND", (i, 0), (i, 0), colors.HexColor(SEV[s])) for i, s in enumerate(SEV_ORDER)],
        ("BACKGROUND", (5, 0), (5, 0), colors.HexColor(STRONG)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
    ]))
    story += [tt, Spacer(1, 0.4 * cm)]
    story += [donut(counts), Spacer(1, 0.3 * cm), bars(findings, cats), PageBreak()]

    # c) Pontos fortes e fracos
    story += [p("Pontos fortes", "h1"),
              p("O que foi verificado e está protegido, com evidência no código. Esta seção "
                "também documenta a cobertura da auditoria.")]
    for c in cats:
        if not c.get("pontos_fortes"):
            continue
        rows = [[Paragraph("<b>Proteção verificada</b>", S["cellb"]), Paragraph("<b>Evidência</b>", S["cellb"])]]
        rows += [[p(t(x["texto"]), "cell"), p(t(x["evidencia"]), "cell")] for x in c["pontos_fortes"]]
        story += [CondPageBreak(4 * cm), p(t(c["nome"]), "h2"),
                  table(rows, [W * 0.55, W * 0.45], header_bg=STRONG)]
    story += [PageBreak(), p("Pontos fracos (riscos centrais)", "h1")]
    for item in DATA["pontos_fracos"]:
        story.append(p("• " + t(item)))
    story.append(PageBreak())

    # d) Achados detalhados por categoria
    story += [p("Achados detalhados", "h1")]
    for c in cats:
        fs = [f for f in findings if f["categoria"] == c["id"]]
        story += [CondPageBreak(3 * cm), p(t(c["nome"]), "h2")]
        if c.get("nao_aplica"):
            story.append(p(t(c["nao_aplica"])))
        if not fs:
            story.append(p("Nenhum achado verificado nesta categoria."))
            continue
        rows = [[Paragraph("<b>Severidade</b>", S["cellb"]), Paragraph("<b>Arquivo:linha</b>", S["cellb"]),
                 Paragraph("<b>Descrição</b>", S["cellb"])]]
        for f in fs:
            desc = f"<b>{f['id']} · {t(f['titulo'])}</b><br/>{t(f['descricao'])}"
            if f.get("condicoes"):
                desc += f"<br/><i>Condições:</i> {t(f['condicoes'])}"
            if f.get("status"):
                desc += f"<br/><font color='{STRONG}'><b>Status: {t(f['status'])}</b></font>"
            rows.append([chip(f["severidade"]), p(t("\n".join(f["locais"])).replace("\n", "<br/>"), "path"),
                         p(desc, "cell")])
        story.append(table(rows, [2.6 * cm, 5.4 * cm, W - 8.0 * cm], zebra=False))
        for f in fs:
            if f.get("trecho"):
                story.append(KeepTogether([
                    Spacer(1, 0.15 * cm),
                    p(f"<b>Trecho {f['id']}</b> — {t(f['locais'][0])}", "small"),
                    Table([[Preformatted(f["trecho"], S["code"], maxLineLength=118)]], colWidths=[W],
                          style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3F4F6")),
                                            ("BOX", (0, 0), (-1, -1), 0.4, LINE)])),
                ]))
    story.append(PageBreak())

    # e) Recomendações
    story += [p("Recomendações priorizadas", "h1")]
    rows = [[Paragraph("<b>Prioridade</b>", S["cellb"]), Paragraph("<b>Ação</b>", S["cellb"]),
             Paragraph("<b>Achados</b>", S["cellb"])]]
    for r in DATA["recomendacoes"]:
        rows.append([p(f"<b>{r['prioridade']}</b>", "cell"), p(t(r["acao"]), "cell"),
                     p(t(", ".join(r["achados"])), "cell")])
    story += [table(rows, [2.0 * cm, W - 5.0 * cm, 3.0 * cm]), PageBreak()]

    # f) Issues para o GitHub
    story += [p("ISSUES PARA O GITHUB", "h1"),
              p("Cada bloco abaixo é o texto completo de uma issue em Markdown, pronto para copiar e colar.")]
    for i, issue in enumerate(DATA["issues"], 1):
        md = issue_markdown(issue, findings)
        block = f"--- ISSUE {i} ---\n{md}\n--- FIM ISSUE {i} ---"
        story += [CondPageBreak(5 * cm), Spacer(1, 0.2 * cm),
                  Table([[Preformatted(block, S["code"], maxLineLength=112)]], colWidths=[W],
                        style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
                                          ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(SEV[issue["severidade"]])),
                                          ("LEFTPADDING", (0, 0), (-1, -1), 6)]),
                        splitByRow=True)]
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm,
                            title=f"Relatório de Auditoria de Segurança — {DATA['projeto']}",
                            author="Claude Code")
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    (HERE / "issues.md").write_text(
        "\n\n".join(f"--- ISSUE {i} ---\n{issue_markdown(x, findings)}\n--- FIM ISSUE {i} ---"
                    for i, x in enumerate(DATA["issues"], 1)) + "\n", encoding="utf-8")
    print(f"PDF gerado: {OUT}")


def issue_markdown(issue: dict, findings: list[dict]) -> str:
    by_id = {f["id"]: f for f in findings}
    ev = []
    for fid in issue["achados"]:
        f = by_id[fid]
        ev.append(f"- **{fid}** — " + ", ".join(f"`{x}`" for x in f["locais"]))
        if f.get("trecho"):
            ev.append("  ```\n" + "\n".join("  " + ln for ln in f["trecho"].splitlines()) + "\n  ```")
    status = [f"{fid}: {by_id[fid]['status']}" for fid in issue["achados"] if by_id[fid].get("status")]
    lines = [
        f"## {issue['titulo']}",
        "",
        *([f"**Status:** {'; '.join(status)}", ""] if status else []),
        f"**Labels sugeridas:** `security`, `severity:{issue['severidade']}`",
        "",
        "### Descrição",
        issue["descricao"],
        "",
        "### Evidência",
        *ev,
        "",
        "### Impacto",
        issue["impacto"],
        "",
        "### Sugestão de correção",
        issue["correcao"],
        "",
        "### Critérios de aceite",
        *[f"- [ ] {c}" for c in issue["aceite"]],
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    build()
