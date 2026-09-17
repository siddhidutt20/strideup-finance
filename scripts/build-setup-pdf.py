# Builds docs/myfinance-setup.pdf — the four-page set-up guide for someone
# taking their own copy with Claude's help.
#
#   pip install reportlab fonttools brotli
#   python3 scripts/build-setup-pdf.py
#
# The typeface is the app's own Poppins, converted out of the woff2 files in
# client/public/fonts so there is no extra binary to carry in the repository.
import os, subprocess, sys, tempfile
from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOFF = os.path.join(REPO, "client", "public", "fonts")
FONTDIR = os.path.join(tempfile.gettempdir(), "sf-pdf-fonts")
os.makedirs(FONTDIR, exist_ok=True)
for a, b in [("poppins-400-latin.woff2", "Poppins-Regular.ttf"),
             ("poppins-500-latin.woff2", "Poppins-Medium.ttf"),
             ("poppins-600-latin.woff2", "Poppins-SemiBold.ttf"),
             ("poppins-700-latin.woff2", "Poppins-Bold.ttf"),
             ("poppins-400-italic-latin.woff2", "Poppins-Italic.ttf")]:
    f = TTFont(os.path.join(WOFF, a))
    f.flavor = None
    f.save(os.path.join(FONTDIR, b))

# Two editions of the same guide. The packages are pre-configured, so the
# reader never has to choose between the household and the business app — which
# means each guide loses a whole step rather than carrying a fork.
EDITION = (sys.argv[1] if len(sys.argv) > 1 else "household").lower()
if EDITION not in ("household", "business"):
    raise SystemExit("usage: build-setup-pdf.py [household|business]")

ED = {
  "household": dict(
    app="myFinance", accent="#5B21B6",
    out="myfinance-setup.pdf",
    zipname="myfinance-household.zip", folder="myfinance-household",
    what="A website only you can sign into, that tracks what comes in, what goes out, "
         "what you own and owe, what you have agreed to pay, and what the next six "
         "months look like.",
    tabs="Home, Money, Budget, Bills, Wealth, Goals, Reports and Forecast",
    forwhom="your own money",
  ),
  "business": dict(
    app="StrideUp Finance", accent="#A8225F",
    out="strideup-setup.pdf",
    zipname="strideup-business.zip", folder="strideup-business",
    what="A website only you can sign into, that tracks revenue, expenses, cash, "
         "outstanding invoices, what is committed to vendors, your profit and loss, "
         "and how long the money lasts.",
    tabs="Overview, Revenue, Expenses, Cash flow, Forecast, Vendors, Payment schedule, "
         "P&amp;L and Ledger",
    forwhom="a company",
  ),
}[EDITION]

OUT = os.path.join(REPO, "docs", ED["out"])

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, KeepTogether, Flowable)

for n, f in [("Poppins","Poppins-Regular.ttf"), ("Poppins-Md","Poppins-Medium.ttf"),
             ("Poppins-Sb","Poppins-SemiBold.ttf"), ("Poppins-Bd","Poppins-Bold.ttf"),
             ("Poppins-It","Poppins-Italic.ttf")]:
    pdfmetrics.registerFont(TTFont(n, os.path.join(FONTDIR, f)))
# Without this, <b> and <i> in a Paragraph resolve to nothing and the markup is
# dropped silently — every bold word in the document renders as plain text.
pdfmetrics.registerFontFamily("Poppins", normal="Poppins", bold="Poppins-Sb",
                              italic="Poppins-It", boldItalic="Poppins-Sb")
pdfmetrics.registerFontFamily("Poppins-Md", normal="Poppins-Md", bold="Poppins-Bd",
                              italic="Poppins-It", boldItalic="Poppins-Bd")
pdfmetrics.registerFontFamily("Poppins-Sb", normal="Poppins-Sb", bold="Poppins-Bd",
                              italic="Poppins-It", boldItalic="Poppins-Bd")

VIOLET = colors.HexColor("#5B21B6")
TEAL   = colors.HexColor("#0A7E96")
PINK   = colors.HexColor("#A8225F")
INK    = colors.HexColor("#171326")
MUTED  = colors.HexColor("#6B6480")
FAINT  = colors.HexColor("#8A80A8")
HAIR   = colors.HexColor("#E9E4F2")
SUNK   = colors.HexColor("#F7F5FB")
WARMBG = colors.HexColor("#FFF8E9")
WARMED = colors.HexColor("#F6E7C4")

M = 17*mm
PW, PH = A4

def S(name, **kw):
    base = dict(fontName="Poppins", fontSize=9.6, leading=14.6, textColor=INK)
    base.update(kw); return ParagraphStyle(name, **base)

body    = S("body", spaceAfter=6)
lead    = S("lead", fontSize=11, leading=16.5, textColor=MUTED, spaceAfter=10)
h1      = S("h1", fontName="Poppins-Bd", fontSize=21, leading=25, spaceAfter=3)
h2      = S("h2", fontName="Poppins-Sb", fontSize=13.5, leading=18, spaceBefore=13, spaceAfter=5)
h3      = S("h3", fontName="Poppins-Sb", fontSize=10.4, leading=14.5, spaceBefore=8, spaceAfter=3)
eyebrow = S("eyebrow", fontName="Poppins-Sb", fontSize=8, leading=11, textColor=FAINT)
small   = S("small", fontSize=8.7, leading=13, textColor=MUTED)
tiny    = S("tiny", fontSize=7.8, leading=11.2, textColor=FAINT)
mono    = S("mono", fontName="Courier", fontSize=8.6, leading=13, textColor=INK)
bullet  = S("bullet", spaceAfter=3, leftIndent=9, bulletIndent=0)

class Rule(Flowable):
    def __init__(self, w=None, c=HAIR, t=0.6, pad=0):
        Flowable.__init__(self); self.w=w; self.c=c; self.t=t; self.pad=pad
    def wrap(self, aw, ah):
        self._w = self.w or aw; return (self._w, self.t + self.pad)
    def draw(self):
        self.canv.setStrokeColor(self.c); self.canv.setLineWidth(self.t)
        self.canv.line(0, self.pad/2, self._w, self.pad/2)

def panel(flows, bg=SUNK, border=HAIR, pad=9):
    t = Table([[flows]], colWidths=[PW - 2*M])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),bg), ("BOX",(0,0),(-1,-1),0.6,border),
        ("LEFTPADDING",(0,0),(-1,-1),pad), ("RIGHTPADDING",(0,0),(-1,-1),pad),
        ("TOPPADDING",(0,0),(-1,-1),pad), ("BOTTOMPADDING",(0,0),(-1,-1),pad),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    return t

def step(n, title, flows):
    num = Table([[Paragraph(f'<font color="#FFFFFF">{n}</font>',
                            S("n", fontName="Poppins-Bd", fontSize=11.5, leading=13,
                              alignment=1))]],
                colWidths=[8.5*mm], rowHeights=[8.5*mm])
    num.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),VIOLET),
        ("ALIGN",(0,0),(-1,-1),"CENTER"), ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("ROUNDEDCORNERS",[3,3,3,3]),
        ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),0),
        ("TOPPADDING",(0,0),(-1,-1),1), ("BOTTOMPADDING",(0,0),(-1,-1),0)]))
    inner = [Paragraph(title, S("st", fontName="Poppins-Sb", fontSize=12.4,
                                leading=16, spaceAfter=4))] + flows
    t = Table([[num, inner]], colWidths=[13*mm, PW - 2*M - 13*mm])
    t.setStyle(TableStyle([("VALIGN",(0,0),(0,0),"TOP"), ("VALIGN",(1,0),(1,0),"TOP"),
        ("TOPPADDING",(0,0),(0,0),1),
        ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),0),
        ("TOPPADDING",(0,0),(-1,-1),0), ("BOTTOMPADDING",(0,0),(-1,-1),9)]))
    return t

def codebox(lines, bg=colors.HexColor("#1A0B2E")):
    def keep(l):
        n = len(l) - len(l.lstrip(" "))
        return "&nbsp;" * n + l.lstrip(" ")
    flows = [Paragraph(f'<font color="#EDE7F8">{keep(l)}</font>' if l.strip() else "&nbsp;",
                       S("c", fontName="Courier", fontSize=8.5, leading=12.6))
             for l in lines]
    t = Table([[flows]], colWidths=[PW - 2*M - 13*mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
        ("TOPPADDING",(0,0),(-1,-1),7), ("BOTTOMPADDING",(0,0),(-1,-1),7)]))
    return t

def kv(rows, w1=52*mm):
    data = [[Paragraph(f"<b>{a}</b>", S("k", fontName="Poppins-Md", fontSize=9)),
             Paragraph(b, small)] for a, b in rows]
    t = Table(data, colWidths=[w1, PW - 2*M - w1 - 2])
    t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
        ("LINEBELOW",(0,0),(-1,-2),0.5,HAIR),
        ("LEFTPADDING",(0,0),(-1,-1),0), ("RIGHTPADDING",(0,0),(-1,-1),4),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5)]))
    return t

def bullets(items, colour=None):
    out = []
    for it in items:
        out.append(Paragraph(it, bullet, bulletText="•"))
    return out

# ── page furniture ──
def furniture(canv, doc):
    canv.saveState()
    canv.setFont("Poppins", 7.4)
    canv.setFillColor(FAINT)
    canv.drawString(M, 11*mm, "Your own myFinance portal")
    canv.drawRightString(PW - M, 11*mm, f"{doc.page}")
    canv.setStrokeColor(HAIR); canv.setLineWidth(0.5)
    canv.line(M, 15*mm, PW - M, 15*mm)
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=M, rightMargin=M, topMargin=15*mm, bottomMargin=20*mm,
                      title="Your own myFinance portal",
                      author="StrideUp Finance",
                      subject="Setting up your own copy with Claude")
doc.addPageTemplates([PageTemplate(id="p",
    frames=[Frame(M, 20*mm, PW - 2*M, PH - 35*mm, id="f")], onPage=furniture)])

st = []
A = st.append

# ═══ PAGE 1 ═══
A(Paragraph("SET-UP GUIDE", eyebrow))
A(Paragraph(f'Your own <font color="{ED["accent"]}">{ED["app"]}</font> portal', h1))
A(Paragraph(f"A private finance app for {ED['forwhom']} — your database, your login, "
            "your web address. Claude does the technical part. You do six clicks.", lead))
A(Rule(pad=8))

A(Paragraph("What you end up with", h2))
A(Paragraph(f"{ED['what']} It works on a phone. Nobody else can see it — not even "
            "the person who gave you this.", body))
A(Spacer(1, 3))
A(Paragraph(f"The tabs down the left are {ED['tabs']}.", small))

A(Paragraph("Before you start", h2))
A(Paragraph("Three free accounts. Sign up for each now and the rest takes about twenty "
            "minutes.", body))
A(kv([
  ("GitHub", 'github.com — where the code lives. Free.'),
  ("Vercel", 'vercel.com — puts it on the internet. Sign in <b>with GitHub</b>, '
             'it makes the next steps much easier. Free.'),
  ("Claude", 'claude.ai — does the technical work for you. A paid plan is needed '
             'for Claude Code, the version that can write files.'),
]))
A(Spacer(1, 7))
A(panel([
  Paragraph("You do not need to know how to code.", S("pt", fontName="Poppins-Sb",
            fontSize=10, leading=14, spaceAfter=3)),
  Paragraph("You will not type a single line of it. Step 3 gives you a message to copy "
            "and paste — Claude reads the package, explains what it is doing, and asks "
            "you questions in plain English. Everything else in this guide is clicking "
            "buttons on a web page.", small),
], bg=WARMBG, border=WARMED))

A(Paragraph("What Claude does, and what you do", h2))
A(Paragraph("Worth knowing up front so nothing surprises you. Claude cannot log into "
            "your Vercel account — it has no password for it — so the part that puts "
            "the app online is yours. It is all clicking.", body))

t = Table([
  [Paragraph('<b><font color="#5B21B6">Claude does</font></b>', S("th", fontName="Poppins-Sb", fontSize=9)),
   Paragraph('<b><font color="#A8225F">You do</font></b>', S("th", fontName="Poppins-Sb", fontSize=9))],
  [Paragraph("Reads the package and explains it<br/>"
             "Puts the code in your GitHub<br/>"
             "Makes your secret password key<br/>"
             "Names the app, sets your currency<br/>"
             "Swaps in your own logo<br/>"
             "Fixes anything that breaks<br/>"
             "Answers every question", small),
   Paragraph("Create the three accounts<br/>"
             "Click <b>New Project</b> in Vercel<br/>"
             "Click <b>Create Database</b><br/>"
             "Paste in two settings<br/>"
             "Click <b>Deploy</b><br/>"
             "Sign in and start using it", small)],
], colWidths=[(PW - 2*M)/2, (PW - 2*M)/2])
t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
  ("BACKGROUND",(0,0),(-1,0),SUNK), ("LINEBELOW",(0,0),(-1,0),0.6,HAIR),
  ("BOX",(0,0),(-1,-1),0.6,HAIR), ("LINEAFTER",(0,0),(0,-1),0.6,HAIR),
  ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
  ("TOPPADDING",(0,0),(-1,-1),7), ("BOTTOMPADDING",(0,0),(-1,-1),7)]))
A(t)

# ═══ PAGE 2 ═══
from reportlab.platypus import PageBreak
A(PageBreak())
A(Paragraph("The six steps", h2))
A(Spacer(1, 3))

A(step(1, "Save the package somewhere you can find it", [
  Paragraph(f"You were sent a file called <b>{ED['zipname']}</b>. Put it on your "
            "Desktop and unzip it (double-click on a Mac; right-click &gt; Extract All "
            f"on Windows). You will get a folder called <b>{ED['folder']}</b>. Leave it "
            "there.", body),
]))

A(step(2, "Open Claude Code and point it at that folder", [
  Paragraph("Claude Code is the version of Claude that can read and write files. Two "
            "ways to get it:", body),
  Paragraph("<b>The app</b> — download Claude Code for Mac or Windows, open it, and "
            f"choose the <b>{ED['folder']}</b> folder you just unzipped.", bullet, bulletText="•"),
  Paragraph("<b>In a browser</b> — go to <b>claude.ai/code</b>. This one works from a "
            "GitHub repository rather than a folder, so ask Claude to do step 3 first "
            "and it will set the repository up for you.", bullet, bulletText="•"),
  Spacer(1, 3),
  Paragraph("Either is fine. The app is simpler if you already have the folder.", small),
]))

A(step(3, "Paste this message to Claude", [
  Paragraph("This is the only thing you have to copy. Paste it exactly as it is and "
            "press enter.", body),
  codebox([
    "I have been given the source code for a personal finance",
    "web app and I want to set up my own private copy of it.",
    "",
    "I am not a developer. Please read docs/your-own-copy.md and",
    "docs/integration.md in this folder first, then walk me",
    "through it one step at a time in plain English.",
    "",
    "Please do these for me:",
    "  1. Put this code in a new private GitHub repository",
    "     under my account.",
    "  2. Generate a strong SESSION_SECRET and tell me the",
    "     exact settings I need to paste into Vercel.",
    "  3. Ask me what to call the app and which currency to",
    "     use, then set those.",
    "",
    "Stop and wait for me whenever you need me to click",
    "something, and tell me exactly what to click.",
  ]),
  Spacer(1, 4),
  Paragraph("Claude will then ask what to call it and which currency to use. Answer in "
            "normal words. It will tell you when to move on.", small),
]))

A(step(4, "Put it on the internet", [
  Paragraph("Claude will have given you a GitHub repository and a short list of "
            "settings. Now:", body),
  Paragraph("Go to <b>vercel.com</b> &gt; <b>Add New</b> &gt; <b>Project</b>", bullet, bulletText="1."),
  Paragraph("Find your new repository in the list and click <b>Import</b>", bullet, bulletText="2."),
  Paragraph("Open <b>Environment Variables</b> and paste in the settings Claude gave "
            "you (there will be two: <font face='Courier'>SESSION_SECRET</font> and "
            "<font face='Courier'>OWNER_PASSWORD</font>)", bullet, bulletText="3."),
  Paragraph("Click <b>Deploy</b> and wait a minute or two", bullet, bulletText="4."),
]))

# ═══ PAGE 3 ═══
A(PageBreak())

A(step(5, "Add the database", [
  Paragraph("This is where your figures are kept. Vercel sets it up for you.", body),
  Paragraph("In your new project, open the <b>Storage</b> tab", bullet, bulletText="1."),
  Paragraph("Click <b>Create Database</b> and choose <b>Neon</b> (Postgres)", bullet, bulletText="2."),
  Paragraph("Accept the free plan and connect it to this project", bullet, bulletText="3."),
  Paragraph("Go to <b>Deployments</b> and click <b>Redeploy</b> on the newest one", bullet, bulletText="4."),
  Spacer(1, 3),
  Paragraph("You do not have to copy any database settings across — connecting it is "
            "enough. The app finds it by itself.", small),
]))

A(step(6, "Sign in", [
  Paragraph("Open the web address Vercel gives you. Sign in with your email and the "
            "<font face='Courier'>OWNER_PASSWORD</font> you chose in step 4.", body),
  Paragraph("That is it. It is live, it is yours, and nobody else has the password.", body),
  Spacer(1, 3),
  Paragraph("<b>On your phone:</b> open the same address in your phone's browser, then "
            "add it to your home screen (Safari: Share &gt; Add to Home Screen. "
            "Chrome: menu &gt; Add to Home screen). It then opens like an app.", small),
]))

A(Rule(pad=10))
A(Paragraph("If something goes wrong", h2))
A(Paragraph("Tell Claude. It has the whole codebase in front of it and a troubleshooting "
            "section in <b>docs/your-own-copy.md</b>. Paste in whatever the screen says "
            "— the error message is the useful part. These three are the common ones:", body))
A(kv([
  ("The page says something is missing",
   "Open <b>/api/health</b> after your web address. It lists exactly what is not set yet, "
   "in plain words. Show that to Claude."),
  ("You cannot sign in",
   "The password is whatever you put in <font face='Courier'>OWNER_PASSWORD</font>. "
   "Change it in Vercel &gt; Settings &gt; Environment Variables and redeploy — "
   "that resets it."),
  ("It deployed but looks broken",
   "Almost always the database step. Check <b>Storage</b> shows a connected database, "
   "then redeploy."),
]))

# ═══ PAGE 4 ═══
A(PageBreak())
A(Paragraph("Changing things later", h2))
A(Paragraph("You do not have to get everything right now. Anything here can be changed "
            "afterwards by asking Claude, or by editing one setting in Vercel and "
            "redeploying.", body))
A(kv([
  ("Its name", "<font face='Courier'>FINANCE_APP_NAME</font>"),
  ("Your currency",
   "<font face='Courier'>FINANCE_BASE_CURRENCY</font> — <b>decide this early.</b> "
   "Changing it later re-does every past figure."),
  ("Your logo", "Replace the picture files in <font face='Courier'>client/public/</font>, "
                "or ask Claude to do it"),
  ("Your name and photo", "Change them inside the app, under <b>My profile</b>"),
  ("Reading invoices automatically",
   "Add an <font face='Courier'>ANTHROPIC_API_KEY</font> from console.anthropic.com. "
   "Optional and paid — <b>everything else works without it</b>."),
]))

A(Paragraph("Two things to know before you rely on it", h2))
A(panel([
  Paragraph("It is for one person.", S("pt", fontName="Poppins-Sb", fontSize=10,
            leading=14, spaceAfter=3)),
  Paragraph("One login, one set of books. There is no way to add a second person to "
            "your copy — if someone else wants their own, they follow this guide and "
            "get their own. That is deliberate: it is why nobody can see your figures.",
            small),
], bg=WARMBG, border=WARMED))
A(Spacer(1, 7))
A(panel([
  Paragraph("It is not connected to your bank.", S("pt", fontName="Poppins-Sb",
            fontSize=10, leading=14, spaceAfter=3)),
  Paragraph("Nothing arrives by itself. You record what happened — by typing it in, or "
            "by uploading a bill or invoice and letting the app read it. The figures it "
            "shows are the ones you put in, which is why they are always explainable.",
            small),
], bg=SUNK, border=HAIR))

A(Paragraph("Your data is yours", h2))
A(Paragraph("Your own database, in your own account. The person who gave you this "
            "cannot see it, and neither can anyone else without your password. There is "
            "an <b>Export</b> button on every page that gives you a spreadsheet of "
            "everything, any time. You are never locked in.", body))

A(Paragraph("The links, in one place", h2))
A(kv([
  ("github.com", "Where your copy of the code lives"),
  ("vercel.com", "Where it runs. Sign in with GitHub."),
  ("claude.ai/code", "Claude Code in a browser"),
  ("console.anthropic.com", "Only if you want invoice reading"),
  ("docs/your-own-copy.md", "The longer written version, inside the package"),
  ("docs/integration.md", "For a developer, if you hand it to one"),
], w1=46*mm))

A(Spacer(1, 12))
A(Rule(pad=8))
A(Paragraph("Built with Claude Code. If you get stuck, the fastest thing you can do is "
            "paste the error into Claude and ask what it means — it can see the whole "
            "app and will usually fix it for you.", tiny))

doc.build(st)
print("built", OUT)
