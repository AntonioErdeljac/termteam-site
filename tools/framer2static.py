"""Turn captured Framer SSR pages into self-contained static HTML (no Framer runtime).

python3 tools/framer2static.py capture out
"""
import re, sys, os, shutil, hashlib, urllib.request, glob

CAP, OUT = sys.argv[1], sys.argv[2]
PAGES = {"home": "", "about-us": "about-us", "services": "services", "gallery": "gallery", "contact": "contact"}
for d in glob.glob(f"{CAP}/services__*"):
    n = os.path.basename(d); PAGES[n] = "services/" + n.split("__")[1]

os.makedirs(f"{OUT}/assets/fonts", exist_ok=True)
os.makedirs(f"{OUT}/images", exist_ok=True)

def local_image(m):
    ident, ext = m.group(1), m.group(2)
    ext = "jpg" if ext == "jpeg" else ext
    dst = f"{OUT}/images/{ident}.{ext}"
    if not os.path.exists(dst):
        cands = sorted(glob.glob(f"{CAP}/assets/images/{ident}.*"), key=os.path.getsize, reverse=True)
        if cands: shutil.copy(cands[0], dst)
        else: print("missing image", ident)
    return f"/images/{ident}.{ext}"

def local_font(url):
    url = url.strip("'\"")
    name = hashlib.md5(url.encode()).hexdigest()[:12] + ".woff2"
    dst = f"{OUT}/assets/fonts/{name}"
    if not os.path.exists(dst):
        if "framerusercontent.com" in url:
            src = f"{CAP}/assets/" + url.replace("https://framerusercontent.com/", "").replace("?", "_").replace("&", "_").replace("=", "_")
            if os.path.exists(src): shutil.copy(src, dst)
            else: return url  # unused subset that was never fetched; leave remote (browser won't request unless used)
        else:
            with urllib.request.urlopen(url) as r: open(dst, "wb").write(r.read())
    return f"/assets/fonts/{name}"

IMG = re.compile(r"https://framerusercontent\.com/images/([A-Za-z0-9]+)\.(jpe?g|png|svg|webp|gif)(?:\?[^\"'\s,)]*)?")

for cap, route in PAGES.items():
    s = open(f"{CAP}/{cap}/ssr.html").read()
    s = re.sub(r"<script\b[^>]*>.*?</script>", "", s, flags=re.S)
    s = re.sub(r'<link[^>]+rel="(?:modulepreload|preload|preconnect|dns-prefetch)"[^>]*>', "", s)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r'<meta name="(?:generator|framer-[^"]*)"[^>]*>', "", s)
    s = re.sub(r'\s+srcset="[^"]*"', "", s)
    s = re.sub(r'url\((["\']?https://(?:fonts\.gstatic\.com|framerusercontent\.com/(?:assets|third-party-assets))/[^)]+)\)', lambda m: f"url({local_font(m.group(1))})", s)
    s = IMG.sub(local_image, s)
    s = s.replace("https://termteam.hr/", "/").replace('href="./', 'href="/')
    s = s.replace("</body>", '<script src="/assets/js/motion.js" defer></script></body>')
    dst = f"{OUT}/{route}/index.html" if route else f"{OUT}/index.html"
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w").write(s)
    left = set(re.findall(r"https://framerusercontent\.com/[^\"'\s)]+", s))
    print(cap, len(s), "remaining framer urls:", len(left), list(left)[:3])
