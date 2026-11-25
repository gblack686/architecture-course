#!/usr/bin/env python3
"""Drive a built course page in a real browser and fail on anything a reader would notice.

    python check_course.py PAGE.html [--shots DIR] [--every-step]

Needs Python Playwright. Uses its Chromium, or installed Chrome when that is missing.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

fails: list[str] = []
passed = 0


def ok(cond: bool, name: str, quiet: bool = False) -> None:
    global passed
    if cond:
        passed += 1
        if not quiet:
            print("PASS " + name)
    else:
        fails.append(name)
        print("FAIL " + name)


# Labels in focus: inside the canvas, clear of each other, clear of every focused icon, readable size.
LAYOUT = """() => { const p=course.stage, st=p.box.getBoundingClientRect(), out=[], follow=!!p.target.follow;
 const hit=(r,q)=>r.left<q.right-1&&q.left<r.right-1&&r.top<q.bottom-1&&q.top<r.bottom-1;
 const b=p.focus.map(id=>[id,p.nodes[id].lab.getBoundingClientRect()]).filter(x=>x[1].width);
 b.forEach(([id,r],i)=>{ if(!follow&&(r.left<st.left-1||r.right>st.right+1||r.top<st.top-1||r.bottom>st.bottom+1)) out.push(id+' label outside');
  b.slice(i+1).forEach(([j,q])=>{ if(hit(r,q)) out.push(id+' label over '+j+' label'); });
  p.focus.forEach(j=>{ const q=p.nodes[j].g.querySelector('.am-icon'); if(q&&j!==id&&hit(r,q.getBoundingClientRect())) out.push(id+' label over '+j+' icon'); }); });
 const size=n=>{const t=n.t1; return parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a}; return {out, font:Math.min(...p.focus.map(id=>size(p.nodes[id])))}; }"""
PACKET = """()=>{const p=course.stage,s=p.box.getBoundingClientRect();p.paused=true;let off=0;
 for(let t=0.75;t<p.loop;t+=0.05){p.clock=t;p.draw();p.pool.forEach(q=>{if(q.g.getAttribute('opacity')!=='1')return;
 const r=q.dot.getBoundingClientRect();if(r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1)off++})}return off}"""
# A failing hop must show its cross and must never light up the node it was headed for.
FAILED = """()=>{const p=course.stage;p.paused=true;return p.plan.map((x,i)=>{ if(!x.hop.fail) return null; const to=x.hop.r?x.e.d.from:x.e.d.to;
 if(p.plan.some(y=>!y.hop.fail&&(y.hop.r?y.e.d.from:y.e.d.to)===to)) return null; let ring=0,cross=0;
 for(let t=0.75;t<p.loop;t+=0.02){p.clock=t;p.draw();ring=Math.max(ring,+p.nodes[to].ring.getAttribute('opacity'));
  if(+p.pool[i].g.getAttribute('opacity'))cross=Math.max(cross,+p.pool[i].cross.getAttribute('opacity'))}
 return ring===0&&cross===1}).filter(x=>x!==null)}"""
SEEK = "t=>{const p=course.stage;p.paused=true;p.clock=t;p.draw()}"
CLIPPED = """()=>[...document.querySelectorAll('button,h1,h2,p,.tag,.phase,.chip b,.chip small,.name')].filter(n=>{const r=n.getBoundingClientRect();
 if(!r.width||n.closest('[hidden],noscript,dialog:not([open])')) return false; return n.scrollWidth>n.clientWidth+2&&getComputedStyle(n).display!=='inline'}).map(n=>(n.id||n.className||n.tagName)+': '+n.textContent.slice(0,40))"""
SMALL = """()=>[...document.querySelectorAll('#app *')].filter(n=>!n.closest('svg')&&[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())&&n.getBoundingClientRect().width&&parseFloat(getComputedStyle(n).fontSize)<11).map(n=>n.id||n.className||n.tagName)"""
CONTRAST = """()=>{const P=s=>{const m=s.match(/[\\d.]+/g).map(Number);return m.length<4?[...m,1]:m};
 const L=c=>{const f=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*f[0]+.7152*f[1]+.0722*f[2]};
 const bg=n=>{for(;n;n=n.parentElement){const c=P(getComputedStyle(n).backgroundColor);if(c[3]>.98)return c}return [255,255,255,1]};
 return [...document.querySelectorAll('#app *')].filter(n=>!n.closest('svg,[hidden],dialog:not([open]),button:disabled')&&[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())&&n.getBoundingClientRect().width)
 .map(n=>{const a=L(P(getComputedStyle(n).color)),b=L(bg(n)),r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);return [r,(n.id||n.className||n.tagName)]}).filter(x=>x[0]<4.5).map(x=>x[1]+' '+x[0].toFixed(2))}"""


def walk(page, label: str, shots: Path | None) -> None:
    lessons = page.evaluate("course.lessons.map(l=>l.n)")
    for i, steps in enumerate(lessons):
        for k in range(steps):
            page.evaluate("([i,k])=>course.open(i,k)", [i, k])
            page.evaluate(SEEK, 1.2)
            at, res = f"{label} lesson {i + 1} step {k + 1}", page.evaluate(LAYOUT)
            ok(not res["out"], f"{at} labels {res['out'] or ''}", True)
            ok(res["font"] >= 10.5, f"{at} label size {res['font']:.1f}px", True)
            ok(not page.evaluate(CLIPPED), f"{at} clipped text {page.evaluate(CLIPPED)}", True)
            ok(page.evaluate("document.documentElement.scrollWidth<=innerWidth"), f"{at} no sideways scroll", True)
            if shots:
                page.evaluate(SEEK, 1.2)
                page.screenshot(path=str(shots / f"{label}-{i + 1}-{k + 1}.png"))
            off = page.evaluate(PACKET)
            ok(off == 0, f"{at} packet stays on screen ({off} frames off)", True)
            ok(all(page.evaluate(FAILED)), f"{at} failed packet is stopped", True)
    print(f"walked {sum(lessons)} steps on {label}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page", type=Path)
    ap.add_argument("--shots", type=Path, default=None, help="where to save screenshots")
    ap.add_argument("--every-step", action="store_true", help="save a desktop screenshot of every step")
    args = ap.parse_args()
    url = args.page.resolve().as_uri()
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as pw:
        try:
            b = pw.chromium.launch()
        except Exception:
            b = pw.chromium.launch(channel="chrome")

        def new(width: int, height: int, **kw):
            page = b.new_context(viewport={"width": width, "height": height}, color_scheme=kw.pop("scheme", "light"), **kw).new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_function("window.course&&course.stage&&course.stage.target")
            page.wait_for_timeout(900)
            return page

        def shot(page, name: str) -> None:
            if args.shots:
                page.screenshot(path=str(args.shots / f"{name}.png"))

        page = new(1440, 900)
        n = page.evaluate("course.lessons[0].n")
        svg = "document.querySelector('#canvas svg').innerHTML"
        a = page.evaluate(svg); page.wait_for_timeout(400)
        ok(a != page.evaluate(svg), "animates")
        page.locator("#pause").click()
        a = page.evaluate(svg); page.wait_for_timeout(400)
        ok(a == page.evaluate(svg), "pause freezes the frame")
        page.locator("#replay").click()
        ok(not page.evaluate("course.stage.paused"), "replay resumes")
        ok(page.evaluate("document.documentElement.scrollHeight<=innerHeight"), "desktop fits the window")
        if n > 1:
            page.locator("#next").click()
            ok(page.locator("#stepno").text_content() == f"Step 2 of {n}", "Next button")
            page.keyboard.press("ArrowLeft")
            ok(page.locator("#stepno").text_content() == f"Step 1 of {n}", "left arrow")
            page.go_back(); page.wait_for_timeout(150)
            ok(page.locator("#stepno").text_content() == f"Step 2 of {n}", "browser back")
            link = page.evaluate("location.hash")
            page.reload(); page.wait_for_timeout(700)
            ok(page.evaluate("location.hash") == link and page.locator("#stepno").text_content() == f"Step 2 of {n}", "a step link reopens that step")
        page.locator("#canvas").click(position={"x": 30, "y": 30}); page.wait_for_timeout(200)
        a = page.evaluate(svg); page.wait_for_timeout(400)
        ok(page.evaluate("course.app.hasAttribute('data-full')") and a != page.evaluate(svg), "click the diagram: live full screen")
        shot(page, "fullscreen")
        page.keyboard.press("Escape")
        ok(not page.evaluate("course.app.hasAttribute('data-full')"), "Escape leaves full screen")
        page.keyboard.press("Control+k")
        page.keyboard.type(page.evaluate("course.lessons[course.lessons.length-1].t.steps[0].title"))
        page.keyboard.press("Enter"); page.wait_for_timeout(100)
        ok(page.evaluate("course.lesson===course.lessons.length-1&&course.step===0"), "search opens the matching step")
        page.keyboard.press("Control+k"); page.keyboard.type("zzqx")
        ok("No step matches" in page.locator("#hits").inner_text(), "search says when nothing matches")
        page.keyboard.press("Escape")
        page.evaluate("course.lessons.forEach((l,i)=>{for(let k=0;k<l.n;k++)course.open(i,k)})")
        ok(page.locator("#pct").inner_text() == "{0} / {0}".format(page.evaluate("course.lessons.length")), "progress reaches the end")
        ok(page.locator("#next").is_disabled(), "Next stops at the end of the course")
        page.locator("#about-btn").click()
        ok(page.locator("#about").is_visible(), "About opens"); page.locator("#about-close").click()
        page.locator("#theme").click()
        ok(page.evaluate("document.documentElement.dataset.theme") == "dark", "theme button")
        page.reload(); page.wait_for_timeout(700)
        ok(page.evaluate("document.documentElement.dataset.theme") == "dark", "theme is remembered")
        page.evaluate("course.open(0,course.lessons[0].n-1)"); page.evaluate(SEEK, 1.2)
        shot(page, "dark")
        for theme in ("dark", "light"):
            page.evaluate("t=>course.theme(t)", theme)
            low: set[str] = set()
            for i in range(page.evaluate("course.lessons.length")):
                for k in range(page.evaluate("i=>course.lessons[i].n", i)):
                    page.evaluate("([i,k])=>course.open(i,k)", [i, k])
                    low |= set(page.evaluate(CONTRAST))
            ok(not low, f"{theme} text contrast {sorted(low) or ''}")
        ok(not page.evaluate(SMALL), f"no text under 11px {page.evaluate(SMALL)}")
        walk(page, "desktop", args.shots if args.every_step else None)
        page.evaluate("course.open(0,0)"); page.evaluate(SEEK, 3.0)
        shot(page, "desktop")

        tab = new(1024, 768)
        tab.locator("#menu").click(); tab.wait_for_timeout(350)
        box = tab.locator("#outline").bounding_box()
        ok(box["x"] == 0, "tablet: the outline opens as a drawer")
        tab.keyboard.press("Escape"); tab.wait_for_timeout(350)
        ok(tab.locator("#outline").is_hidden(), "tablet: Escape closes the drawer")
        walk(tab, "tablet", None)
        tab.evaluate("course.open(0,0)"); tab.evaluate(SEEK, 3.0); shot(tab, "tablet")

        phone = new(390, 844, has_touch=True, is_mobile=True)
        nav = phone.locator(".nav").bounding_box()
        ok(nav["y"] + nav["height"] <= 845, "phone: Back and Next are on screen")
        phone.locator("#next").tap()
        ok(phone.evaluate("course.step===1||course.lessons[0].n===1"), "phone: Next works by touch")
        shot(phone, "phone")
        phone.locator("#find-btn").tap()
        ok(phone.locator("#q").is_visible(), "phone: search opens"); phone.keyboard.press("Escape")
        walk(phone, "phone", None)

        calm = new(1440, 900, reduced_motion="reduce")
        a = calm.evaluate(svg); calm.wait_for_timeout(400)
        ok(a == calm.evaluate(svg), "reduced motion: starts still")
        ok(calm.evaluate("course.plan===undefined&&course.stage.pool.some(p=>p.g.getAttribute('opacity')==='1')"), "reduced motion: packets are still shown")

        bare = b.new_context(java_script_enabled=False).new_page(); bare.goto(url)
        ok("Step" in bare.content() and bare.locator("noscript").count() == 1, "without JavaScript the text is in the page")
        ok(not errors, f"no script errors {errors}")
        b.close()
    print(f"\n{passed} passed, {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
