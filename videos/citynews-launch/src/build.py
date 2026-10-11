import re, os, sys, json
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
src = open(os.path.join(here, 'index.tpl'), encoding='utf-8').read()
voice = sys.argv[1] if len(sys.argv) > 1 else 'assets/vo-omni'
VO = json.load(open(os.path.join(root, voice, 'words.json'), encoding='utf-8'))


def vo_audio():
    tags = []
    for k in ['vo1', 'vo2', 'vo3', 'vo4', 'vo5', 'vo6']:
        v = VO[k]
        tags.append(f'      <audio id="{k}" src="{v["file"]}" data-start="{v["start"]}" data-duration="{v["dur"]}" data-track-index="5" data-volume="1"></audio>')
    for i, w in enumerate(VO['vo2']['words'][:7]):
        t = round(VO['vo2']['start'] + w['s'], 2)
        tags.append(f'      <audio id="sfx-t{i + 1}" src="assets/sfx/tick.wav" data-start="{t}" data-duration="0.05" data-track-index="8" data-volume="0.5"></audio>')
    return '\n'.join(tags)


def logo(path, sid):
    s = open(os.path.join(root, path), encoding='utf-8').read()
    s = re.sub(r'<title[^>]*>.*?</title>', '', s)
    s = s.replace('<svg ', f'<svg id="{sid}" aria-label="CityNews Cuiabá" ', 1).replace(' aria-labelledby="t"', '')
    s = s.replace('<path d="M74.5', '<path class="arc" d="M74.5', 1)
    s = s.replace('<circle ', '<circle class="ponto" ', 1)
    n = [0]

    def wm(m):
        n[0] += 1
        return f'<path class="wm-{n[0]}" d="'
    return re.sub(r'<path d="', wm, s)


def mapa():
    s = open(os.path.join(root, 'assets/map/brazil.svg'), encoding='utf-8').read()
    s = s.replace('<path ', '<path pathLength="1" ')
    return s.replace('<svg ', '<svg id="s1-map-svg" aria-hidden="true" ', 1)


def qr():
    s = open(os.path.join(root, 'assets/qr.svg'), encoding='utf-8').read()
    s = re.sub(r'<\?xml[^>]*\?>', '', s)
    s = re.sub(r'width="(\d+)" height="(\d+)"', r'viewBox="0 0 \1 \2" width="100%" height="100%"', s, count=1)
    return s.replace('<svg ', '<svg id="s4-qr-svg" aria-label="QR code para citynewscuiaba.vercel.app" ', 1)


src = src.replace('{{LOGO_VERTICAL}}', logo('assets/logo/citynews-vertical-negative.svg', 's1-logo'))
src = src.replace('{{LOGO_HORIZONTAL}}', logo('assets/logo/citynews-horizontal-negative.svg', 's4-logo'))
src = src.replace('{{MAP}}', mapa())
src = src.replace('{{VO_AUDIO}}', vo_audio())
src = src.replace('{{VO_JSON}}', json.dumps(VO, ensure_ascii=False))
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(src)
print('index.html', len(src), 'bytes', 'voz:', voice)
