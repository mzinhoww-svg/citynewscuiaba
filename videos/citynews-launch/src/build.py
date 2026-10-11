import re
src=open('src/index.tpl').read()
def logo(path, sid):
    s=open(path).read()
    s=re.sub(r'<title[^>]*>.*?</title>','',s)
    s=s.replace('<svg ',f'<svg id="{sid}" aria-label="CityNews Cuiabá" ',1).replace(' aria-labelledby="t"','')
    s=s.replace('<path d="M74.5','<path class="arc" d="M74.5',1)
    s=s.replace('<circle ','<circle class="ponto" ',1)
    n=[0]
    def wm(m):
        n[0]+=1; return f'<path class="wm-{n[0]}" d="'
    s=re.sub(r'<path d="',wm,s)
    return s
src=src.replace('{{LOGO_VERTICAL}}',logo('assets/logo/citynews-vertical-negative.svg','s1-logo'))
src=src.replace('{{LOGO_HORIZONTAL}}',logo('assets/logo/citynews-horizontal-negative.svg','s4-logo'))
open('index.html','w').write(src)
