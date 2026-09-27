from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
def text_path(fontfile,text,size,track_em=0.0,x0=0,base=0):
    f=TTFont(fontfile); gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm; hmtx=f['hmtx']
    s=size/upm; pen=SVGPathPen(gs); x=x0; bp=BoundsPen(gs)
    for ch in text:
        gn=cmap[ord(ch)]
        tp=TransformPen(pen,(s,0,0,-s,x,base)); gs[gn].draw(tp)
        tb=TransformPen(bp,(s,0,0,-s,x,base)); gs[gn].draw(tb)
        x+=hmtx[gn][0]*s+track_em*size
    return pen.getCommands(), x, bp.bounds
def cap(fontfile): 
    f=TTFont(fontfile); return f['OS/2'].sCapHeight/f['head'].unitsPerEm
if __name__=='__main__':
    c8=cap('/tmp/sg800.ttf'); print('capH em',c8)
    size=101/c8; d,x,b=text_path('/tmp/sg800.ttf','CityNews',size,-0.04,0,0); print('size',size,'width',b[2]-b[0],'target 631')
