"""Monta prévias de um render com faixas de música por baixo da narração (escolha da música).

Uso: python3 -I previa_musica.py <render.mp4 só com narração> <pasta das músicas> <pasta de saída>
As faixas testadas e o ponto de entrada de cada uma estão em FAIXAS.
"""
import json,os,subprocess,sys
V=sys.argv[1]
LIB=os.path.join(sys.argv[2],'')
OUT=sys.argv[3]
DUR=34.0
VOZ=[(0.1,3.77),(3.85,7.99),(9.5,13.48),(14.35,17.03),(17.4,22.33),(23.2,27.24),(28.7,33.25)]
FAIXAS=[('a_hazy','mixkit-hazy-after-hours-132.mp3',7.0),('b_curiosity','mixkit-curiosity-480.mp3',4.03),('c_action','mixkit-what-about-action-474.mp3',7.3)]
BED,DUCK=-18.0,-27.0  # LUFS alvo da música sem voz / sob a voz
def loud(args):
    log=subprocess.run(['ffmpeg','-nostdin','-hide_banner',*args,'-af','loudnorm=print_format=json','-f','null','-'],capture_output=True,text=True).stderr
    j=json.loads(log[log.rindex('{'):log.rindex('}')+1]); return float(j['input_i']),float(j['input_tp'])
def env_points():
    d=DUCK-BED
    def g(t):
        v=0.0
        for a,b in VOZ:
            if a<=t<=b: e=d
            elif a-0.3<t<a: e=d*(t-(a-0.3))/0.3
            elif b<t<b+0.45: e=d*(1-(t-b)/0.45)
            else: e=0.0
            v=min(v,e)
        return v
    ts=[round(i*0.05,2) for i in range(int(DUR/0.05)+1)]
    pts=[(t,round(g(t),2)) for t in ts]
    res=[pts[0]]
    for i in range(1,len(pts)-1):
        (t0,v0),(t1,v1),(t2,v2)=res[-1],pts[i],pts[i+1]
        if abs((v0+(v2-v0)*(t1-t0)/(t2-t0))-v1)>0.05: res.append(pts[i])
    res.append(pts[-1])
    return res
def expr(pts):
    e=f'{pts[-1][1]}'
    for (t0,v0),(t1,v1) in reversed(list(zip(pts,pts[1:]))):
        seg=f'({v0}+({v1}-({v0}))*(t-{t0})/({t1}-{t0}+0.0001))'
        e=f'if(lt(t,{t1}),{seg},{e})'
    return e
pts=env_points()
print('envelope',[(round(t,2),round(v,1)) for t,v in pts])
for nome,arq,off in FAIXAS:
    mi,_=loud(['-ss',str(off),'-t',str(DUR),'-i',LIB+arq])
    g=BED-mi
    vol=f"volume='pow(10,(({expr(pts)})+{g:.2f})/20)':eval=frame"
    fc=(f"[1:a]atrim={off}:{off+DUR},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
        f"afade=t=in:st=0:d=0.6,afade=t=out:st={DUR-2.5}:d=2.5,{vol}[m];"
        f"[0:a]aresample=48000[v];[v][m]amix=inputs=2:normalize=0:duration=first[o]")
    tmp=f'{OUT}/{nome}.tmp.wav'
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',V,'-i',LIB+arq,'-filter_complex',fc,'-map','[o]',tmp],check=True)
    i,tp=loud(['-i',tmp])
    G=-14.0-i
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',V,'-i',tmp,'-map','0:v','-map','1:a',
        '-af',f'volume={G:.2f}dB,alimiter=limit=0.79:level=false','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',f'{OUT}/previa_{nome}.mp4'],check=True)
    fi,ftp=loud(['-i',f'{OUT}/previa_{nome}.mp4'])
    print(nome,f'musica {mi:.1f} LUFS -> ganho {g:+.1f} dB; mix final {fi:.1f} LUFS / {ftp:.1f} dBTP')
    subprocess.run(['rm',tmp])
