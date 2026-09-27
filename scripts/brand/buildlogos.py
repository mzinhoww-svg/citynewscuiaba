from genlogo import text_path, cap
import cairosvg, os
OUT='/mnt/user-data/outputs/citynews-kit/design-system/assets/logo/svg'; os.makedirs(OUT,exist_ok=True)
TINTA='#0F1B2D'; URUCUM='#E8491D'; WHITE='#FFFFFF'
c8=cap('/tmp/sg800.ttf'); c5=cap('/tmp/sg500.ttf')
SYM_ARC='M74.5 29.4 A32 32 0 1 0 74.5 70.6'
def symbol(tx,ty,s,ink,dot):
    return (f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f}) translate(-10.5 -10.5)">'
            f'<path d="{SYM_ARC}" fill="none" stroke="{ink}" stroke-width="15" stroke-linecap="butt"/>'
            f'<circle cx="90" cy="50" r="9" fill="{dot}"/></g>')
def word(x,base,cap_px,ink,text='CityNews',font='/tmp/sg800.ttf',track=-0.065,capr=c8):
    size=cap_px/capr; d,_,b=text_path(font,text,size,track,x,base); return f'<path d="{d}" fill="{ink}"/>',b
def svg(w,h,body,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-labelledby="t"><title id="t">{title}</title>{body}</svg>'
def horizontal(ink,dot,city='Cuiabá',name='horizontal'):
    s=169/88.5
    w1,b1=word(244,136,101,ink)
    w2,b2=word(247,205,36,ink,city,'/tmp/sg500.ttf',0.0,c5)
    # shift wordmark so its left edge sits at 244
    body=symbol(23,41,s,ink,dot)+w1+w2
    W=max(b1[2],b2[2])+23; H=225
    return svg(W,H,body,f'CityNews {city}')
def vertical(ink,dot,city='Cuiabá'):
    s=169/88.5*1.1; symw=88.5*s
    w_word=631; W=w_word+80; sx=(W-symw)/2
    body=symbol(sx,30,s,ink,dot)
    top=30+79*s+60
    w1,b1=word(40,top+101,101,ink)
    size5=36/c5
    from genlogo import text_path as tp
    _,_,bb=tp('/tmp/sg500.ttf',city,size5,0,0,0); cw=bb[2]-bb[0]
    w2,b2=word((W-cw)/2,top+101+60,36,ink,city,'/tmp/sg500.ttf',0.0,c5)
    return svg(W,top+101+60+40,body+w1+w2,f'CityNews {city}')
def sym_only(ink,dot):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 90 80" role="img" aria-labelledby="t"><title id="t">CityNews</title><path d="{SYM_ARC}" fill="none" stroke="{ink}" stroke-width="15"/><circle cx="90" cy="50" r="9" fill="{dot}"/></svg>'
files={
 'citynews-horizontal.svg':horizontal(TINTA,URUCUM),
 'citynews-horizontal-negative.svg':horizontal(WHITE,URUCUM),
 'citynews-horizontal-mono.svg':horizontal(TINTA,TINTA),
 'citynews-vertical.svg':vertical(TINTA,URUCUM),
 'citynews-vertical-negative.svg':vertical(WHITE,URUCUM),
 'citynews-symbol.svg':sym_only(TINTA,URUCUM),
 'citynews-symbol-negative.svg':sym_only(WHITE,URUCUM),
 'citynews-horizontal-varzea-grande.svg':horizontal(TINTA,URUCUM,'Várzea Grande'),
 'citynews-horizontal-guia-cuiaba.svg':horizontal(TINTA,URUCUM,'Guia Cuiabá'),
}
for n,s in files.items():
    open(f'{OUT}/{n}','w').write(s)
    bg=None
    cairosvg.svg2png(bytestring=s.encode(),write_to=f'/tmp/prev-{n}.png',output_width=900,background_color=('#0F1B2D' if 'negative' in n else '#FFFFFF'))
print(sorted(os.listdir(OUT)))
