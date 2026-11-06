import json,textwrap
from PIL import ImageFont
font=ImageFont.truetype('/usr/share/fonts/truetype/lato/Lato-Regular.ttf',23)
slides=json.load(open('.presentation-build/content.json'))
for n,s in enumerate(slides,1):
 if s.get('kind')!='table':continue
 heights=[54]
 for row in s['rows']:
  counts=[]
  for cell,w in zip(row,s['widths']):
   lines=['']
   for word in cell.split():
    nxt=(lines[-1]+' '+word).strip()
    if font.getlength(nxt)>w-24 and lines[-1]:lines.append(word)
    else:lines[-1]=nxt
   counts.append(len(lines))
  heights.append(max(60,max(counts)*28+18))
 s['heights']=heights
 if sum(heights)>466:print(n,sum(heights),s['title'])
json.dump(slides,open('.presentation-build/content-measured.json','w'))
