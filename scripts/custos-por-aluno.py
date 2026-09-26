# Modelo paramétrico de custo operacional por aluno (docs/estimativa-custos-por-aluno.md).
# Edite as constantes e rode: python3 scripts/custos-por-aluno.py

import math
FX = 5.50  # R$/US$

# --- preços unitários (US$) ---
SUPABASE_PRO = 25.0
COMPUTE = {"micro": 0.0, "small": 15.0, "medium": 60.0}
STORAGE_INCL_GB, STORAGE_GB = 100, 0.021
EGRESS_INCL_GB, EGRESS_GB = 250, 0.09
DB_INCL_GB, DB_GB = 8, 0.125
FLY_INGEST = 5.70      # shared-cpu-1x 1GB
FLY_FACE = 11.0        # shared-cpu-2x 2GB (aprox.)
FLY_API_LOW, FLY_API_HIGH = 2.0, 5.0
VERCEL_PRO = 20.0
RESEND_PRO = 20.0
DOMINIO = 0.6          # ~R$40/ano
WA_AUTH = 0.0315       # OTP, 1x por responsável
WA_UTIL = 0.008        # entrega por evento
WA_MKT = 0.0625        # se a Meta classificar entrega como marketing
ARTE_MED, ARTE_HIGH = 0.05, 0.17  # gpt-image por arte 1024² (medium/high, ref. gpt-image-1)

# --- volume por aluno ---
EVENTOS_ANO = 6
FOTOS_ALUNO_EVENTO = 10          # 2.000 fotos / 200 alunos
MB_FOTO = 0.70 + 0.02 + 0.045    # 2560px + thumb + ~3 recortes
RETENCAO_ANOS = 2
EGRESS_MB_FOTO_WORKERS = 1.4     # ingest + face baixam a foto (Supabase us-east → Fly gru)
EGRESS_MB_ALUNO_EVENTO_FAMILIA = 15 + 7   # visualização 2x + ZIP
DB_MB_ALUNO_ANO = 0.4            # photo_faces + vetores + trilha

fotos_ano = EVENTOS_ANO * FOTOS_ALUNO_EVENTO
storage_gb_aluno = fotos_ano * RETENCAO_ANOS * MB_FOTO / 1024
egress_gb_aluno_ano = (fotos_ano * EGRESS_MB_FOTO_WORKERS + EVENTOS_ANO * EGRESS_MB_ALUNO_EVENTO_FAMILIA) / 1024
db_gb_aluno = DB_MB_ALUNO_ANO * RETENCAO_ANOS / 1024
wa_aluno_mes = (WA_AUTH + EVENTOS_ANO * WA_UTIL) / 12
wa_mkt_aluno_mes = (WA_AUTH + EVENTOS_ANO * WA_MKT) / 12
arte_med_mes = EVENTOS_ANO * ARTE_MED / 12
arte_high_mes = EVENTOS_ANO * ARTE_HIGH / 12

print(f"storage/aluno (estoque 2 anos): {storage_gb_aluno*1024:.0f} MB")
print(f"egress/aluno/ano: {egress_gb_aluno_ano*1024:.0f} MB")
print(f"db/aluno (estoque): {db_gb_aluno*1024:.1f} MB")
print(f"WA/aluno/mês: US${wa_aluno_mes:.4f} (mkt: {wa_mkt_aluno_mes:.4f})")
print(f"arte/aluno/mês: med US${arte_med_mes:.4f} high US${arte_high_mes:.4f}\n")

cen = [
  dict(nome="A — Piloto", escolas=1, alunos=200, compute="micro", face=1, ingest=1, api=FLY_API_LOW, resend=0),
  dict(nome="B — Tração", escolas=10, alunos=3000, compute="small", face=2, ingest=1, api=FLY_API_LOW, resend=0),
  dict(nome="C — Escala", escolas=50, alunos=15000, compute="medium", face=3, ingest=2, api=FLY_API_HIGH, resend=RESEND_PRO),
]
for c in cen:
    n = c["alunos"]
    fixo = SUPABASE_PRO + COMPUTE[c["compute"]] + VERCEL_PRO + c["ingest"]*FLY_INGEST + c["face"]*FLY_FACE + c["api"] + c["resend"] + DOMINIO
    st = max(0, n*storage_gb_aluno - STORAGE_INCL_GB) * STORAGE_GB
    eg = max(0, n*egress_gb_aluno_ano/12 - EGRESS_INCL_GB) * EGRESS_GB
    db = max(0, n*db_gb_aluno - DB_INCL_GB) * DB_GB
    plat = fixo + st + eg + db
    por_aluno = plat/n + wa_aluno_mes
    print(f"== {c['nome']} ({c['escolas']} escolas, {n} alunos) ==")
    print(f"  fixo US${fixo:.1f} | storage exc US${st:.1f} ({n*storage_gb_aluno:.0f} GB) | egress exc US${eg:.1f} ({n*egress_gb_aluno_ano/12:.0f} GB/mês) | db exc US${db:.1f} ({n*db_gb_aluno:.1f} GB)")
    print(f"  plataforma US${plat:.1f}/mês = R${plat*FX:,.0f}/mês")
    print(f"  por aluno/mês: US${por_aluno:.4f} = R${por_aluno*FX:.2f}")
    print(f"  + arte medium: R${(por_aluno+arte_med_mes)*FX:.2f} | + arte high: R${(por_aluno+arte_high_mes)*FX:.2f}")
    print(f"  WA como marketing: R${(plat/n+wa_mkt_aluno_mes)*FX:.2f}")
    print(f"  por aluno/ANO (base): R${por_aluno*FX*12:.2f}\n")
