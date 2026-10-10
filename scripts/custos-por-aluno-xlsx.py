# Gera o .xlsx formatado da estimativa de custos (abas Resumo, Parametros, Volume, Cenarios, Sensibilidade)
# para importar no Google Sheets via Arquivo > Importar > Substituir planilha. Modelo textual: scripts/custos-por-aluno.py
# Uso: python3 scripts/custos-por-aluno-xlsx.py  (requer openpyxl)

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

# ---------- paleta ----------
NAVY, NAVY2, TEAL = "1B2A41", "2E4057", "3D7A8A"
INPUT_BG, OUTPUT_BG, ZEBRA, LINE, MUTED, TEXT = "FFF4CC", "EAF4EE", "F6F7F9", "D9DDE3", "6B7280", "1F2937"
FONT = "Arial"
def f(size=10, bold=False, color=TEXT, italic=False): return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)
def fill(c): return PatternFill("solid", fgColor=c)
thin = Side(style="thin", color=LINE); hair = Side(style="hair", color=LINE)
BOX = Border(top=thin, bottom=thin, left=thin, right=thin)
BOTTOM = Border(bottom=thin)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True, indent=1)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center", indent=1)
USD = '[$US$-409] #,##0.00'; USD4 = '[$US$-409] #,##0.0000'; BRL = '[$R$-416] #,##0.00'; BRL0 = '[$R$-416] #,##0'; INT = '#,##0'; GB = '#,##0.0'

wb = Workbook()

def widths(ws, w):
    for i, x in enumerate(w, 1): ws.column_dimensions[get_column_letter(i)].width = x
def title(ws, text, sub, ncols):
    ws.row_dimensions[1].height = 30; ws.row_dimensions[2].height = 18
    c = ws.cell(row=1, column=1, value=text); c.font = f(16, True, NAVY); c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    c = ws.cell(row=2, column=1, value=sub); c.font = f(9, color=MUTED, italic=True); c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
def header(ws, row, labels, aligns=None):
    ws.row_dimensions[row].height = 30
    for i, l in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=l); c.font = f(10, True, "FFFFFF"); c.fill = fill(NAVY)
        c.alignment = CENTER if (aligns is None or i > 1) else LEFT
        c.border = BOX
def section(ws, row, text, ncols):
    ws.row_dimensions[row].height = 22
    c = ws.cell(row=row, column=1, value=text); c.font = f(10, True, "FFFFFF"); c.fill = fill(TEAL); c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    for i in range(2, ncols + 1): ws.cell(row=row, column=i).fill = fill(TEAL)
def body(c, fmt=None, bg=None, bold=False, align=None):
    c.font = f(10, bold); c.border = BOX
    if fmt: c.number_format = fmt
    if bg: c.fill = fill(bg)
    c.alignment = align or (RIGHT if fmt else LEFT)
def note(ws, row, text, ncols, height=None):
    c = ws.cell(row=row, column=1, value=text); c.font = f(9, color=MUTED); c.alignment = Alignment(horizontal="left", wrap_text=True, vertical="top", indent=1)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=ncols)
    if height: ws.row_dimensions[row].height = height
def zebra(ws, r, ncols, on):
    if on:
        for i in range(1, ncols + 1):
            if ws.cell(row=r, column=i).fill.fgColor.rgb in (None, "00000000"): ws.cell(row=r, column=i).fill = fill(ZEBRA)

# ================= Parametros =================
P = wb.active; P.title = "Parametros"
title(P, "Parâmetros", "Preços de lista (set/2026) e volumes derivados da spec. Amarelo = entrada editável; nada foi confirmado em fatura real.", 3)
header(P, 4, ["Parâmetro", "Valor", "Unidade / observação"], aligns=True)
R = {}; r = 5
def sec(text): 
    global r; section(P, r, text, 3); r += 1
def param(key, label, val, fmt, obs):
    global r
    R[key] = r
    a = P.cell(row=r, column=1, value=label); body(a)
    b = P.cell(row=r, column=2, value=val); body(b, fmt, INPUT_BG, align=RIGHT)
    c = P.cell(row=r, column=3, value=obs); body(c); c.font = f(9, color=MUTED)
    P.row_dimensions[r].height = 20; r += 1
sec("Geral")
param("fx", "Câmbio (R$ por US$)", 5.5, '0.00', "Edite aqui e toda a planilha recalcula")
sec("Supabase (banco, Auth, Storage, Realtime, pgvector)")
param("pro", "Plano Pro", 25, USD, "Por mês. Inclui 8 GB de banco, 100 GB de Storage, 250 GB de egress e compute Micro")
param("small", "Compute Small (adicional)", 15, USD, "Por mês. Necessário por volta de 3.000 alunos")
param("medium", "Compute Medium (adicional)", 60, USD, "Por mês. Necessário por volta de 15.000 alunos")
param("st_inc", "Storage incluído", 100, GB, "No plano Pro")
param("st_x", "Storage excedente", 0.021, USD4, "Por GB-mês")
param("eg_inc", "Egress incluído", 250, GB, "Por mês, no plano Pro")
param("eg_x", "Egress excedente", 0.09, USD, "")
param("db_inc", "Banco incluído", 8, GB, "No plano Pro")
param("db_x", "Banco excedente", 0.125, USD4, "Por GB-mês")
sec("Fly.io (workers em São Paulo)")
param("ingest", "ingest-worker · shared-cpu-1x, 1 GB", 5.70, USD, "Por máquina ligada 24 h")
param("face", "face-worker · shared-cpu-2x, 2 GB", 11.00, USD, "Por máquina. A vazão nessa máquina NÃO foi medida (spike §5.3)")
sec("Outros serviços")
param("vercel", "Vercel Pro", 20, USD, "Por assento/mês. O plano Hobby não permite uso comercial")
param("resend", "Resend Pro", 20, USD, "Por mês. Grátis até 3.000 e-mails/mês")
param("dom", "Domínio .com.br", 0.6, USD, "Por mês (~R$ 40/ano)")
param("wa_auth", "WhatsApp · autenticação (BR)", 0.0315, USD4, "Por mensagem. OTP, uma vez por responsável")
param("wa_util", "WhatsApp · utilidade (BR)", 0.008, USD4, "Por mensagem. Entrega da pasta do aluno por evento")
param("wa_mkt", "WhatsApp · marketing (BR)", 0.0625, USD4, "Por mensagem. RISCO: se a Meta classificar a entrega assim")
param("arte_m", "Arte IA · gpt-image 1024², qualidade média", 0.05, USD, "Por arte. Referência gpt-image-1; o código usa gpt-image-2 sem quality — CONFIRMAR")
param("arte_h", "Arte IA · gpt-image 1024², qualidade alta", 0.17, USD, "Por arte")
sec("Volume por aluno (derivado da spec)")
param("ev", "Eventos por ano letivo", 6, INT, "Estimativa (spike §5.4: alguns eventos por mês na escola piloto)")
param("fpe", "Fotos por aluno por evento", 10, INT, "2.000 fotos ÷ 200 alunos (spec §1, D3)")
param("mb_f", "Foto processada (2560 px, JPEG q85)", 0.70, '0.000', "D3")
param("mb_t", "Miniatura WebP 320 px", 0.02, '0.000', "D4")
param("mb_c", "Recortes de rosto (~3 por foto)", 0.045, '0.000', "spec §7.3")
param("ret", "Retenção da foto de evento", 2, INT, "spec §9.4 · events.retention_until")
param("eg_w", "Egress por foto pelos workers", 1.4, '0.0', "ingest + face baixam a foto (Supabase us-east → Fly gru)")
param("eg_fam", "Egress por aluno por evento pela família", 22, INT, "Ver a pasta 2× + 1 ZIP")
param("db_mb", "Banco por aluno por ano", 0.4, '0.0', "photo_faces, vetores só de consentidos, biometric_events")
widths(P, [44, 16, 78]); P.freeze_panes = "A5"
p = lambda k: f"Parametros!$B${R[k]}"

# ================= Volume =================
V = wb.create_sheet("Volume")
title(V, "Volume por aluno", "Grandezas unitárias calculadas a partir da aba Parâmetros. Nada aqui é editável.", 4)
header(V, 4, ["Grandeza", "Valor", "Unidade", "Como é calculado"], aligns=True)
VR = {}; r = 5
def vol(key, label, formula, fmt, unit, how):
    global r
    VR[key] = r
    body(V.cell(row=r, column=1, value=label))
    body(V.cell(row=r, column=2, value=formula), fmt, OUTPUT_BG, align=RIGHT)
    body(V.cell(row=r, column=3, value=unit), align=CENTER)
    c = V.cell(row=r, column=4, value=how); body(c); c.font = f(9, color=MUTED)
    V.row_dimensions[r].height = 20; r += 1
vol("fotos", "Fotos por ano", f"={p('ev')}*{p('fpe')}", INT, "fotos", "eventos × fotos por evento")
vol("st", "Storage em regime", f"=B{VR['fotos']}*{p('ret')}*({p('mb_f')}+{p('mb_t')}+{p('mb_c')})/1024", '0.000', "GB", "fotos/ano × retenção × MB por foto")
vol("eg", "Egress por ano", f"=(B{VR['fotos']}*{p('eg_w')}+{p('ev')}*{p('eg_fam')})/1024", '0.000', "GB/ano", "download pelos workers + visualização da família")
vol("db", "Banco em regime", f"={p('db_mb')}*{p('ret')}/1024", '0.0000', "GB", "MB/ano × retenção")
vol("wa", "WhatsApp · utilidade", f"=({p('wa_auth')}+{p('ev')}*{p('wa_util')})/12", USD4, "US$/mês", "OTP amortizado no ano + 1 entrega por evento")
vol("wa_mkt", "WhatsApp · se marketing", f"=({p('wa_auth')}+{p('ev')}*{p('wa_mkt')})/12", USD4, "US$/mês", "cenário de risco")
vol("arte_m", "Arte IA · qualidade média", f"={p('ev')}*{p('arte_m')}/12", USD4, "US$/mês", "1 arte por evento")
vol("arte_h", "Arte IA · qualidade alta", f"={p('ev')}*{p('arte_h')}/12", USD4, "US$/mês", "1 arte por evento")
widths(V, [34, 16, 12, 50]); V.freeze_panes = "A5"
v = lambda k: f"Volume!$B${VR[k]}"

# ================= Cenarios =================
C = wb.create_sheet("Cenarios")
title(C, "Cenários de escala", "Amarelo = entrada do cenário. As linhas de cálculo somam custo fixo e excedentes de Supabase; o custo por aluno inclui o WhatsApp.", 5)
header(C, 4, ["", "A — Piloto", "B — Tração", "C — Escala", "Observação"], aligns=True)
CR = {}; r = 5
def csec(text):
    global r; section(C, r, text, 5); r += 1
def crow(key, label, vals, fmt, bg, obs="", bold=False):
    global r
    CR[key] = r
    a = C.cell(row=r, column=1, value=label); body(a, bold=bold)
    for j, val in enumerate(vals, 2):
        body(C.cell(row=r, column=j, value=val), fmt, bg, bold=bold, align=RIGHT)
    o = C.cell(row=r, column=5, value=obs); body(o); o.font = f(9, color=MUTED)
    if bold:
        for j in range(1, 6): C.cell(row=r, column=j).fill = fill("DCE6F0")
    C.row_dimensions[r].height = 20; r += 1
def each(fn): return [fn(c) for c in "BCD"]
def cr(key, col): return f"{col}{CR[key]}"
csec("Entradas")
crow("esc", "Escolas", [1, 10, 50], INT, INPUT_BG)
crow("alu", "Alunos", [200, 3000, 15000], INT, INPUT_BG)
crow("comp", "Compute adicional Supabase", [0, f"={p('small')}", f"={p('medium')}"], USD, INPUT_BG, "0 = Micro incluído no Pro")
crow("ing", "Máquinas ingest-worker", [1, 1, 2], INT, INPUT_BG)
crow("fac", "Máquinas face-worker", [1, 2, 3], INT, INPUT_BG, "Chute: medir a vazão na Fly antes de fechar")
crow("api", "api-server na Fly", [2, 2, 5], USD, INPUT_BG, "Auto-stop, quase sempre parado")
crow("res", "Resend", [0, 0, f"={p('resend')}"], USD, INPUT_BG, "Grátis até 3.000 e-mails/mês")
csec("Custo fixo mensal (US$)")
crow("l_pro", "Supabase Pro", each(lambda c: f"={p('pro')}"), USD, None)
crow("l_comp", "Compute adicional", each(lambda c: f"={cr('comp',c)}"), USD, None)
crow("l_ver", "Vercel Pro", each(lambda c: f"={p('vercel')}"), USD, None)
crow("l_ing", "Fly · ingest-worker", each(lambda c: f"={cr('ing',c)}*{p('ingest')}"), USD, None)
crow("l_fac", "Fly · face-worker", each(lambda c: f"={cr('fac',c)}*{p('face')}"), USD, None)
crow("l_api", "Fly · api-server", each(lambda c: f"={cr('api',c)}"), USD, None)
crow("l_res", "Resend", each(lambda c: f"={cr('res',c)}"), USD, None)
crow("l_dom", "Domínio", each(lambda c: f"={p('dom')}"), USD, None)
crow("fixo", "Fixo total", each(lambda c: f"=SUM({c}{CR['l_pro']}:{c}{CR['l_dom']})"), USD, None, bold=True)
csec("Excedentes do Supabase (US$)")
crow("st_gb", "Storage total", each(lambda c: f"={cr('alu',c)}*{v('st')}"), GB, None)
crow("st_x", "Storage excedente", each(lambda c: f"=MAX(0,{cr('st_gb',c)}-{p('st_inc')})*{p('st_x')}"), USD, None)
crow("eg_gb", "Egress total por mês", each(lambda c: f"={cr('alu',c)}*{v('eg')}/12"), GB, None)
crow("eg_x", "Egress excedente", each(lambda c: f"=MAX(0,{cr('eg_gb',c)}-{p('eg_inc')})*{p('eg_x')}"), USD, None)
crow("db_gb", "Banco total", each(lambda c: f"={cr('alu',c)}*{v('db')}"), GB, None)
crow("db_x", "Banco excedente", each(lambda c: f"=MAX(0,{cr('db_gb',c)}-{p('db_inc')})*{p('db_x')}"), USD, None)
csec("Resultado")
crow("plat", "Plataforma por mês (US$)", each(lambda c: f"={cr('fixo',c)}+{cr('st_x',c)}+{cr('eg_x',c)}+{cr('db_x',c)}"), USD, OUTPUT_BG)
crow("plat_brl", "Plataforma por mês (R$)", each(lambda c: f"={cr('plat',c)}*{p('fx')}"), BRL0, OUTPUT_BG, bold=True)
crow("alu_usd", "Por aluno por mês (US$)", each(lambda c: f"={cr('plat',c)}/{cr('alu',c)}+{v('wa')}"), USD4, OUTPUT_BG, "plataforma ÷ alunos + WhatsApp")
crow("alu_brl", "Por aluno por mês (R$)", each(lambda c: f"={cr('alu_usd',c)}*{p('fx')}"), BRL, OUTPUT_BG, bold=True)
crow("arte_m", "Por aluno por mês + arte IA média (R$)", each(lambda c: f"=({cr('alu_usd',c)}+{v('arte_m')})*{p('fx')}"), BRL, OUTPUT_BG)
crow("arte_h", "Por aluno por mês + arte IA alta (R$)", each(lambda c: f"=({cr('alu_usd',c)}+{v('arte_h')})*{p('fx')}"), BRL, OUTPUT_BG)
crow("wa_mkt", "Por aluno por mês se WhatsApp for marketing (R$)", each(lambda c: f"=({cr('plat',c)}/{cr('alu',c)}+{v('wa_mkt')})*{p('fx')}"), BRL, OUTPUT_BG)
crow("ano", "Por aluno por ano, base (R$)", each(lambda c: f"={cr('alu_brl',c)}*12"), BRL, OUTPUT_BG)
widths(C, [46, 17, 17, 17, 46]); C.freeze_panes = "B5"

# ================= Precificacao =================
Pr = wb.create_sheet("Precificacao")
title(Pr, "Precificação e lucro", "Preço por aluno, imposto da nota fiscal (Simples Nacional, alíquota efetiva pela faixa de receita) e o que sobra por cenário. Amarelo = entrada.", 5)
header(Pr, 4, ["", "A — Piloto", "B — Tração", "C — Escala", "Observação"], aligns=True)
PR = {}; r = 5
def psec(text):
    global r; section(Pr, r, text, 5); r += 1
def prow(key, label, vals, fmt, bg, obs="", bold=False):
    global r
    PR[key] = r
    body(Pr.cell(row=r, column=1, value=label), bold=bold)
    for j, val in enumerate(vals, 2):
        body(Pr.cell(row=r, column=j, value=val), fmt, bg, bold=bold, align=RIGHT)
    o = Pr.cell(row=r, column=5, value=obs); body(o); o.font = f(9, color=MUTED)
    if bold:
        for j in range(1, 6): Pr.cell(row=r, column=j).fill = fill("DCE6F0")
    Pr.row_dimensions[r].height = 20; r += 1
def pin(key, label, val, fmt, obs):
    global r
    PR[key] = r
    body(Pr.cell(row=r, column=1, value=label))
    body(Pr.cell(row=r, column=2, value=val), fmt, INPUT_BG, align=RIGHT)
    Pr.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
    o = Pr.cell(row=r, column=3, value=obs); body(o); o.font = f(9, color=MUTED)
    Pr.row_dimensions[r].height = 20; r += 1
PCT = '0.0%'
psec("Entradas")
pin("preco", "Preço por aluno por mês", 5.50, BRL, "Valor cobrado da escola, por aluno matriculado")
pin("anexo", "Anexo do Simples Nacional (III ou V)", "III", None, "Software/SaaS cai no Anexo V, salvo Fator R ≥ 28% (folha ÷ receita), que leva ao Anexo III. Confirmar com o contador")
pin("taxa", "Taxa de cobrança / meio de pagamento", 0.0, PCT, "Boleto ou Pix é cobrado por escola, não por aluno; por isso quase zero. Cartão: 2 a 4%")
pin("inad", "Inadimplência", 0.0, PCT, "Percentual da receita que não entra")
psec("Tabela do Simples Nacional (receita bruta acumulada em 12 meses)")
hdr = r
for j, l in enumerate(["Faixa (a partir de)", "Anexo III · alíquota", "Anexo III · dedução", "Anexo V · alíquota", "Anexo V · dedução"], 1):
    c = Pr.cell(row=r, column=j, value=l); c.font = f(9, True, NAVY2); c.border = BOX; c.alignment = CENTER
r += 1
faixas = [(0, 0.06, 0, 0.155, 0), (180000, 0.112, 9360, 0.18, 4500), (360000, 0.135, 17640, 0.195, 9900),
          (720000, 0.16, 35640, 0.205, 17100), (1800000, 0.21, 125640, 0.23, 62100), (3600000, 0.33, 648000, 0.305, 540000)]
t0 = r
for fx_ in faixas:
    for j, val in enumerate(fx_, 1):
        body(Pr.cell(row=r, column=j, value=val), BRL0 if j in (1, 3, 5) else PCT, INPUT_BG, align=RIGHT)
    r += 1
t1 = r - 1
TF = f"$A${t0}:$A${t1}"; A3 = f"$B${t0}:$B${t1}"; D3 = f"$C${t0}:$C${t1}"; A5 = f"$D${t0}:$D${t1}"; D5 = f"$E${t0}:$E${t1}"
def pr(key, col): return f"{col}{PR[key]}"
def each3(fn): return [fn(c) for c in "BCD"]
preco = f"$B${PR['preco']}"; anexo = f"$B${PR['anexo']}"; taxa = f"$B${PR['taxa']}"; inad = f"$B${PR['inad']}"
psec("Receita e imposto (por mês)")
prow("alu", "Alunos", each3(lambda c: f"=Cenarios!{c}{CR['alu']}"), INT, None)
prow("rec", "Receita bruta mensal", each3(lambda c: f"={preco}*{pr('alu',c)}"), BRL0, None, "preço × alunos")
prow("rbt", "Receita bruta em 12 meses (RBT12)", each3(lambda c: f"={pr('rec',c)}*12"), BRL0, None, "define a faixa do Simples")
prow("aliq", "Alíquota efetiva do Simples", each3(lambda c: f"=IF({anexo}=\"V\",(LOOKUP({pr('rbt',c)},{TF},{A5})*{pr('rbt',c)}-LOOKUP({pr('rbt',c)},{TF},{D5}))/{pr('rbt',c)},(LOOKUP({pr('rbt',c)},{TF},{A3})*{pr('rbt',c)}-LOOKUP({pr('rbt',c)},{TF},{D3}))/{pr('rbt',c)})"), PCT, OUTPUT_BG, "(alíquota nominal × RBT12 − dedução) ÷ RBT12")
prow("imp", "Imposto destacado na nota fiscal", each3(lambda c: f"={pr('rec',c)}*{pr('aliq',c)}"), BRL0, None)
prow("tx", "Taxa de cobrança + inadimplência", each3(lambda c: f"={pr('rec',c)}*({taxa}+{inad})"), BRL0, None)
prow("liq", "Receita líquida", each3(lambda c: f"={pr('rec',c)}-{pr('imp',c)}-{pr('tx',c)}"), BRL0, None, bold=True)
psec("Custos (por mês, em R$)")
prow("plat", "Plataforma (aba Cenarios)", each3(lambda c: f"=Cenarios!{c}{CR['plat_brl']}"), BRL0, None, "Supabase, Vercel, Fly, domínio e excedentes")
prow("wa", "WhatsApp (OTP + entregas)", each3(lambda c: f"={pr('alu',c)}*{v('wa')}*{p('fx')}"), BRL0, None)
prow("custo", "Custo total", each3(lambda c: f"={pr('plat',c)}+{pr('wa',c)}"), BRL0, None, bold=True)
psec("Resultado")
prow("lucro", "Lucro mensal", each3(lambda c: f"={pr('liq',c)}-{pr('custo',c)}"), BRL0, OUTPUT_BG, "antes de pessoas, jurídico e pró-labore", bold=True)
prow("margem", "Margem sobre a receita bruta", each3(lambda c: f"={pr('lucro',c)}/{pr('rec',c)}"), PCT, OUTPUT_BG)
prow("lpa", "Lucro por aluno por mês", each3(lambda c: f"={pr('lucro',c)}/{pr('alu',c)}"), BRL, OUTPUT_BG, bold=True)
prow("lano", "Lucro em 12 meses", each3(lambda c: f"={pr('lucro',c)}*12"), BRL0, OUTPUT_BG)
prow("lam", "Lucro mensal se houver arte IA média (1 por evento)", each3(lambda c: f"={pr('lucro',c)}-{pr('alu',c)}*{v('arte_m')}*{p('fx')}"), BRL0, OUTPUT_BG)
prow("lah", "Lucro mensal se houver arte IA alta (1 por evento)", each3(lambda c: f"={pr('lucro',c)}-{pr('alu',c)}*{v('arte_h')}*{p('fx')}"), BRL0, OUTPUT_BG)
prow("be", "Ponto de equilíbrio (alunos)", each3(lambda c: f"=Cenarios!{c}{CR['fixo']}*{p('fx')}/({preco}*(1-{pr('aliq',c)}-{taxa}-{inad})-{v('wa')}*{p('fx')})"), INT, OUTPUT_BG, "custo fixo ÷ (preço líquido − WhatsApp por aluno); ignora excedentes de storage")
widths(Pr, [46, 17, 17, 17, 46]); Pr.freeze_panes = "B5"

# ================= Resumo (primeira aba) =================
S = wb.create_sheet("Resumo", 0)
title(S, "IAschool · Estimativa de custo operacional por aluno", "21/09/2026 · base para precificação · preços de lista, nada confirmado em fatura · edite Parâmetros e Cenários; esta aba só lê", 8)
header(S, 4, ["Cenário", "Escolas", "Alunos", "Plataforma\nR$/mês", "Custo por aluno\nR$/mês", "+ arte IA média\nR$/mês", "+ arte IA alta\nR$/mês", "Por aluno\nR$/ano"], aligns=True)
S.row_dimensions[4].height = 36
for i, (name, cc) in enumerate([("A — Piloto", "B"), ("B — Tração", "C"), ("C — Escala", "D")], 5):
    body(S.cell(row=i, column=1, value=name), bold=True)
    body(S.cell(row=i, column=2, value=f"=Cenarios!{cc}{CR['esc']}"), INT)
    body(S.cell(row=i, column=3, value=f"=Cenarios!{cc}{CR['alu']}"), INT)
    body(S.cell(row=i, column=4, value=f"=Cenarios!{cc}{CR['plat_brl']}"), BRL0)
    body(S.cell(row=i, column=5, value=f"=Cenarios!{cc}{CR['alu_brl']}"), BRL, OUTPUT_BG, bold=True)
    body(S.cell(row=i, column=6, value=f"=Cenarios!{cc}{CR['arte_m']}"), BRL)
    body(S.cell(row=i, column=7, value=f"=Cenarios!{cc}{CR['arte_h']}"), BRL)
    body(S.cell(row=i, column=8, value=f"=Cenarios!{cc}{CR['ano']}"), BRL)
    S.row_dimensions[i].height = 24
r = 9
section(S, r, "Cobrando o preço da aba Precificacao por aluno/mês, com nota fiscal (Simples Nacional)", 8); r += 1
header(S, r, ["Cenário", "Alunos", "Receita\nR$/mês", "Imposto NF\nR$/mês", "Custo total\nR$/mês", "Lucro\nR$/mês", "Margem", "Lucro por aluno\nR$/mês"], aligns=True); S.row_dimensions[r].height = 36; r += 1
for name, cc in [("A — Piloto", "B"), ("B — Tração", "C"), ("C — Escala", "D")]:
    body(S.cell(row=r, column=1, value=name), bold=True)
    body(S.cell(row=r, column=2, value=f"=Precificacao!{cc}{PR['alu']}"), INT)
    body(S.cell(row=r, column=3, value=f"=Precificacao!{cc}{PR['rec']}"), BRL0)
    body(S.cell(row=r, column=4, value=f"=Precificacao!{cc}{PR['imp']}"), BRL0)
    body(S.cell(row=r, column=5, value=f"=Precificacao!{cc}{PR['custo']}"), BRL0)
    body(S.cell(row=r, column=6, value=f"=Precificacao!{cc}{PR['lucro']}"), BRL0, OUTPUT_BG, bold=True)
    body(S.cell(row=r, column=7, value=f"=Precificacao!{cc}{PR['margem']}"), '0%')
    body(S.cell(row=r, column=8, value=f"=Precificacao!{cc}{PR['lpa']}"), BRL, OUTPUT_BG, bold=True)
    S.row_dimensions[r].height = 24; r += 1
note(S, r, "Lucro antes de pessoas, jurídico e pró-labore. Preço, anexo do Simples e taxas são editáveis na aba Precificacao.", 8); r += 2
section(S, r, "O que isso diz sobre a precificação", 8); r += 1
for t in [
 "1 · Abaixo de ~1.000 alunos o custo é quase todo fixo (Supabase, Vercel, duas máquinas de worker). Precifique com mínimo por escola + valor por aluno; só \"por aluno\" faz o piloto dar prejuízo.",
 "2 · O custo marginal de um aluno é centavos: storage, egress, banco e WhatsApp somam menos de R$ 0,05 por aluno/mês em qualquer cenário. O reconhecimento facial self-hosted (D1 da spec) é o que garante isso.",
 "3 · A única variável cara é a arte gerada por IA (gpt-image): uma por evento em qualidade alta é 3 a 5× o resto do custo por aluno. Se entrar no produto, precifique como módulo ou crédito.",
]:
    c = S.cell(row=r, column=1, value=t); c.font = f(10); c.alignment = Alignment(horizontal="left", wrap_text=True, vertical="center", indent=1)
    S.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8); S.row_dimensions[r].height = 34; r += 1
r += 1
section(S, r, "Fora da conta", 8); r += 1
for t in [
 "Pessoas: suporte à escola, operação dos workers, conformidade, DPO/encarregado LGPD. Tende a superar a infraestrutura inteira; estime por escola e coloque no mínimo mensal.",
 "Jurídico (termo de consentimento com os quatro escopos), onboarding na Meta, desenvolvimento pendente (deploy dos workers, desfoque, Fases 4 e 5), impostos e taxa do meio de pagamento.",
]:
    c = S.cell(row=r, column=1, value=t); c.font = f(10); c.alignment = Alignment(horizontal="left", wrap_text=True, vertical="center", indent=1)
    S.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8); S.row_dimensions[r].height = 30; r += 1
r += 1
note(S, r, "Documento completo: docs/estimativa-custos-por-aluno.md · modelo recalculável: scripts/custos-por-aluno.py · Amarelo = entrada, verde = resultado.", 8)
widths(S, [18, 10, 10, 15, 17, 17, 17, 15])

# ================= Sensibilidade =================
Se = wb.create_sheet("Sensibilidade")
title(Se, "Sensibilidade e pendências", "O que mexe no número, e o que falta confirmar antes de fechar preço.", 3)
header(Se, 4, ["Se…", "Efeito", "Tamanho"], aligns=True)
r = 5
for a, b, c_ in [
 ("A escola liga keep_originals (5 MB por foto)", "Storage ×7 → ~660 MB por aluno", "+US$ 0,014 por aluno/mês; cobrar adicional por evento"),
 ("A Meta classifica a entrega como marketing", "WhatsApp de US$ 0,0066 → 0,034 por aluno/mês", "+R$ 0,15 por aluno/mês; mitigar com template de utilidade"),
 ("Arte IA em alta qualidade, uma por evento", "+US$ 0,085 por aluno/mês", "Multiplica o custo por aluno de B e C por 3 a 5"),
 ("Arte IA ilimitada (cota atual: 50/dia por usuário)", "Não previsível", "Precificar como módulo ou crédito"),
 ("Retenção de 2 → 5 anos", "Storage ×2,5", "+US$ 0,003 por aluno/mês; irrelevante"),
 ("face-worker mais lento que o esperado na Fly", "Mais máquinas de US$ 11", "Custo fixo, não por aluno; medir antes de fechar"),
 ("Supabase em sa-east-1 em vez de us-east-1", "Menor latência, egress igual", "Custo de lista zero"),
]:
    for j, val in enumerate((a, b, c_), 1): body(Se.cell(row=r, column=j, value=val))
    zebra(Se, r, 3, (r % 2 == 0)); Se.row_dimensions[r].height = 22; r += 1
r += 1
section(Se, r, "Pendências para fechar o número", 3); r += 1
for t in [
 "1 · Medir a vazão do face-worker na shared-cpu-2x da Fly (scripts/spike-face/src/bench_throughput.py) e o custo real do primeiro mês com evento de teste.",
 "2 · Confirmar preço e qualidade padrão de gpt-image-2 na tabela da OpenAI.",
 "3 · Confirmar a categoria do template de entrega na Meta (utilidade × marketing).",
 "4 · Decidir se a arte por IA continua no produto ou vira módulo à parte.",
]:
    c = Se.cell(row=r, column=1, value=t); c.font = f(10); c.alignment = Alignment(horizontal="left", wrap_text=True, vertical="center", indent=1)
    Se.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3); Se.row_dimensions[r].height = 22; r += 1
r += 1
section(Se, r, "Componentes e fontes no repositório", 3); r += 1
header(Se, r, ["Componente", "Onde roda · cobra por", "Fonte"], aligns=True); r += 1
for row in [
 ("App web (Vite/React)", "Vercel · assento/mês", "artifacts/iaschool-app/vercel.json"),
 ("Banco, Auth, Storage, Realtime, pgvector, pg_cron", "Supabase us-east-1 · plano + compute + GB excedente", "artifacts/iaschool-app/SUPABASE.md"),
 ("ingest-worker (miniaturas, expurgo)", "Fly.io gru, shared-cpu-1x 1 GB · máquina 24 h", "artifacts/ingest-worker/fly.toml"),
 ("face-worker (SCRFD + ArcFace em CPU)", "Fly.io gru, shared-cpu-2x 2 GB · máquina 24 h, escala por máquina", "artifacts/face-worker/fly.toml"),
 ("api-server (geração de arte)", "Fly.io gru, 512 MB, auto-stop · sob demanda", "fly.toml (raiz)"),
 ("Geração de arte", "OpenAI gpt-image-2, 1024×1024 · por imagem", "artifacts/api-server/src/routes/generation.ts"),
 ("E-mail transacional", "Resend via SMTP do Supabase · mensagens/mês", "docs/pendencias-producao.md"),
 ("OTP do responsável e entrega", "Meta WhatsApp Cloud API · por mensagem e categoria", "docs/pendencias-producao.md"),
]:
    for j, val in enumerate(row, 1): body(Se.cell(row=r, column=j, value=val))
    zebra(Se, r, 3, (r % 2 == 0)); Se.row_dimensions[r].height = 22; r += 1
widths(Se, [46, 50, 50]); Se.freeze_panes = "A5"

import os, sys
out = sys.argv[1] if len(sys.argv) > 1 else "IAschool - Estimativa de custos por aluno.xlsx"
wb.save(out)
print("ok", [ws.title for ws in wb.worksheets])
