from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(r"C:\Users\rohit\OneDrive\Documents\Default Project")
url = (ROOT / "nextgen-creative-kit.html").as_uri() + "#motion=capture"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_page(viewport={"width":1080,"height":1920})
    pg.goto(url, wait_until="load"); pg.wait_for_function("window.__reel && window.__reel.ready")
    for t in [2.5,9.5,16.5,24.5,33.5,44,51.5,58]:
        pg.evaluate("(t)=>{window.__reel.seek(t); return new Promise(r=>requestAnimationFrame(()=>r()));}", t)
        print(t, pg.evaluate("""() => {
          const sc=[...document.querySelectorAll('.m-scene')].find(s=>getComputedStyle(s).visibility!=='hidden');
          const f=sc.querySelector('.frame'), out=[];
          f.querySelectorAll('.m-copy .m-ln-i').forEach(el=>{
            const rg=document.createRange(); rg.selectNodeContents(el);
            for (const r of rg.getClientRects()) out.push([Math.round(r.right),Math.round(r.bottom)]);
          });
          return out;
        }"""))
    b.close()
