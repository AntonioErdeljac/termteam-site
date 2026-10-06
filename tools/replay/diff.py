import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
out=sys.argv[3]
h=min(a.height,b.height); w=min(a.width,b.width)
a=a.crop((0,0,w,h)); b=b.crop((0,0,w,h))
d=ImageChops.difference(a,b).convert('L').point(lambda v:255 if v>24 else 0)
print('size',a.size if a.size==b.size else (Image.open(sys.argv[1]).size,Image.open(sys.argv[2]).size))
bands=[]
for y in range(0,h,100):
    c=d.crop((0,y,w,min(h,y+100))); n=sum(c.histogram()[255:])
    if n>50: bands.append((y,n))
print('diff px total',sum(d.histogram()[255:]),'bands',bands[:60])
# composite: live | new | diff-highlight
hl=Image.composite(Image.new('RGB',(w,h),(255,0,0)),b,d)
c=Image.new('RGB',(w*3,h)); c.paste(a,(0,0)); c.paste(b,(w,0)); c.paste(hl,(2*w,0))
c.save(out)
