import re, html
SRC='/home/claude/vcrm/server/'
old=open('/home/claude/inv/comp/index.html').read()
css=old[old.index('<style>')+7:old.index('</style>')]
# retheme: navy+blue -> dark teal
for a,b in [('#0c1626','#0a1c21'),('#111f33','#10282e'),('#16253d','#143239'),('#0a1220','#08171b'),('#3556f5','#0f766e'),('#8da0ff','#5eead4'),
            ('rgba(53,86,245,','rgba(20,184,166,'),('#2740c9','#0b5a54'),('#6f86ff','#14b8a6'),('rgba(141,160,255,.35)','rgba(94,234,212,.35)')]:
    css=css.replace(a,b)
css+='''
.shot{position:absolute;border-radius:22px;overflow:hidden;border:2px solid rgba(255,255,255,.12);box-shadow:0 30px 70px rgba(0,0,0,.45)}
.shot img{display:block;width:100%;height:auto}
.ring{position:absolute;border:5px solid #5fe3b0;border-radius:18px;box-shadow:0 0 30px rgba(95,227,176,.5)}
.pill2{position:absolute;padding:12px 26px;border-radius:30px;background:rgba(95,227,176,.16);color:#5fe3b0;font-size:30px;font-weight:650}
.mute{color:#6b7f9d}
.code{font-size:28px}
.side .bk b{font-size:32px}
'''
D=77.5
cuts=[0,5,12,22,32,40,52,59,66,72.5]
ends=cuts[1:]+[D]

def esc(s): return html.escape(s,quote=False)
def colour(line):
    t=esc(line)
    pat=re.compile(r"(//.*$)|('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|if|else|return|try|catch|await|async|function|export)\b|\b(\d+)\b")
    def r(m):
        if m.group(1): return '<i class="c">%s</i>'%m.group(1)
        if m.group(2): return '<i class="s">%s</i>'%m.group(2)
        if m.group(3): return '<i class="k">%s</i>'%m.group(3)
        return '<i class="n">%s</i>'%m.group(4)
    return pat.sub(r,t)
def lines(path,a,b,skip=()):
    L=open(SRC+path).read().split('\n')
    out=[]
    for n in range(a,b+1):
        if n in skip: out.append('  // ... (one more rule: satisfied)')
        else: out.append(L[n-1])
    return out
def codewin(id_,title,ls,left,top,width,at,step,extra=''):
    body=''.join('<span class="cl">%s</span>'%colour(l) for l in ls)
    return '<div id="%s" class="win%s" data-at="%s" style="left:%dpx;top:%dpx;width:%dpx%s"><div class="wh"><i></i><i></i><i></i> %s</div><div class="code" data-type="%s,%s">%s</div></div>'%(id_,'' if 'opacity:0' in extra else ' a',at-0.3,left,top,width,extra,title,at,step,body)

def h2(*rows):
    # rows: list of list of (word, blue?)
    out=''
    for r in rows:
        out+='<span class="mask">'+' '.join('<span class="w%s">%s</span>'%(' blue' if b else '',w) for w,b in r)+'</span>'
    return out
def scene(i,title_html,body,hero=False):
    s=cuts[i];d=round(ends[i]-s,2)
    cls='display hero' if hero else 'display h2s'
    return '<section id="s%d" class="scene dark clip" data-start="%s" data-duration="%s" data-track-index="0"><div class="gl" data-layout-allow-overflow></div>%s%s</section>'%(i+1,s,d,('<h2 class="%s">%s</h2>'%(cls,title_html)) if title_html else '',body)

MK='<svg class="mk" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#0f766e"/><path d="M17 20 L32 46 L47 20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
S=[]
# 1 hook
S.append(scene(0,h2([('Know',0),('who',0),('to',0)],[('call',1),('next.',1)]),
 '<div class="brand a" data-at="0.2" style="top:70px;left:110px">%s<b>Vendor CRM</b></div><div class="sub a" data-at="1.6" style="left:110px;top:790px">AI reads vendor-customer chats.<br>Real screens, real code.</div>'%MK, hero=True))
# 2 problem
def uc(left,at,old_,oldt,new): return '<div class="uc a" data-at="%s" style="left:%dpx"><div class="old">%s</div><div class="oldt">%s</div><div class="arrow">&darr;</div><div class="new">%s</div></div>'%(at,left,old_,oldt,new)
S.append(scene(1,h2([('What',0),('it',0)],[('replaces.',1)]),
 uc(110,1.2,'Chats nobody reads','Hundreds of vendor-customer chats, scrolled by hand.','Every chat read, summarised and labelled')+
 uc(690,1.9,'Upset customers wait','A complaint sits unanswered for hours.','Flagged "needs attention" on the dashboard')+
 uc(1270,2.6,'Vendors see everything','Or you build a separate tool per vendor.','Each vendor sees only their own customers')))
# 3 dashboard
S.append(scene(2,h2([('Everything',0),('that',0)],[('needs',0),('you.',1)]),
 '<div class="shot a" data-at="0.9" style="left:110px;top:350px;width:1180px"><img src="assets/img/dash.png"/></div>'
 '<div class="side" style="left:1340px;top:350px;width:480px">'
 '<div class="bk a" data-at="2.0"><b>PKR 94,400</b>paid revenue, from real orders</div>'
 '<div class="bk a" data-at="3.4"><b>12 need attention</b>upset, at risk, or waiting for a reply</div>'
 '<div class="bk a" data-at="4.8"><b>24.8 min</b>average first reply, vendor to customer</div></div>'))
# 4 customer + AI
S.append(scene(3,h2([('Read',0),('the',0),('chat.',0)],[('Get',0),('the',0),('insight.',1)]),
 '<div class="shot a" data-at="0.9" style="left:110px;top:350px;width:1180px"><img src="assets/img/zain.png"/></div>'
 '<div class="ring a" data-at="4.0" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx"></div>'%(110+int(1132*.6146),350+int(175*.6146),int(653*.6146),int(405*.6146))+
 '<div class="side" style="left:1340px;top:350px;width:480px">'
 '<div class="bk a" data-at="2.0"><b>English and Roman Urdu</b>the chat on the left is real demo data</div>'
 '<div class="bk a" data-at="4.4"><b>Intent, mood, summary</b>ready to buy, neutral, waiting 1 h</div>'
 '<div class="bk a" data-at="5.8"><b>A reply to send</b>one click to copy, vendor edits it</div></div>'))
# 5 architecture
nodes=[('Chat API','Sendbird-style','Read server-side. The token never reaches the browser.'),
       ('Sync','every 5 minutes','Fetches only new messages and stores them.'),
       ('PostgreSQL','10 tables','Customers, conversations, messages, insights, orders.'),
       ('AI insight','Claude or rules','Intent, mood, summary, reply, stage.'),
       ('Web app','React + JWT','Owner sees all. Vendors see their own.')]
nb=''
for i,(t,b,c) in enumerate(nodes):
    nb+='<div class="nd a" data-at="%s" style="left:%dpx;width:310px"><div class="nt">%s</div><div class="nb">%s</div><div class="nc">%s</div></div>'%(1.0+i*.5,70+i*360,t,b,c)
    if i<4: nb+='<div class="ln2 a" data-at="%s" style="left:%dpx"></div>'%(1.2+i*.5,70+i*360+310+5)
nb+='<div id="pkt" style="left:0;top:690px"></div>'
nb+='<div class="foot a" data-at="3.6" style="top:850px"><span>Node 22 + Express 5</span><span>PostgreSQL</span><span>React 19 + Vite</span><span>JWT roles</span></div>'
S.append(scene(4,h2([('One',0),('chat.',0)],[('Five',1),('stages.',1)]),nb))
# 6 code
A=lines('ai.js',122,131)
B=lines('ai.js',43,48,skip=(46,))
side=('<div class="side" style="left:1450px;top:360px;width:380px">'
 '<div class="bk a" data-at="1.4"><b>Claude if a key is set</b>falls back to rules on any error</div>'
 '<div class="bk a" data-at="6.6"><b>Offline rule engine</b>English and Roman Urdu keywords</div></div>')
S.append(scene(5,h2([('The',0),('AI',0),('step.',1)],[('Real',0),('code.',0)]),
 codewin('cwA','server/ai.js',A,110,360,1310,1.0,.35)+
 codewin('cwB','server/ai.js',B,110,360,1310,6.3,.4,';opacity:0')+side))
# 7 isolation
C=lines('routes.js',19,27)
S.append(scene(6,h2([('Vendors',0),('see',0)],[('only',1),('their',1),('own.',1)]),
 codewin('cwC','server/routes.js',C,110,370,960,1.0,.4)+
 '<div class="shot a" data-at="2.0" style="left:1130px;top:370px;width:690px"><img src="assets/img/vendor.png"/></div>'
 '<div class="bk a" data-at="3.6" style="position:absolute;left:1130px;top:790px;width:690px"><b>Tested</b>a vendor opening another vendor\'s customer gets 404</div>'))
# 8 numbers
def st(left,at,v,l): return '<div class="st a" data-at="%s" style="left:%dpx"><div class="sv display">%s</div><div class="sl">%s</div></div>'%(at,left,v,l)
S.append(scene(7,h2([('Measured,',0)],[('not',0),('claimed.',1)]),
 st(110,0.8,'2,024','conversations analysed in 6.4 s')+st(500,1.2,'38 ms','dashboard, median<br>(p95 47 ms)')+st(890,1.6,'6 ms','customer page, median<br>(p95 10.6 ms)')+st(1280,2.0,'42 / 42','API checks passed')+
 '<div class="note a" data-at="2.6">2,024 synthetic conversations, 10,072 messages, offline rule engine, one server process.</div>'))
# 9 limits
def rk(left,at,t,h,b): return '<div class="rk a" data-at="%s" style="left:%dpx"><div class="rt">%s</div><div class="rh">%s</div><div class="rb">%s</div></div>'%(at,left,t,h,b)
S.append(scene(8,h2([('What',0),('is',0),('not',0)],[('proven',1),('yet.',1)]),
 rk(110,1.0,'Not run live','Sendbird and Claude','The code follows the documented APIs but has not run against live services. No keys yet.')+
 rk(690,1.5,'Limit','Rules are keyword-based','Good for a demo and as a fallback. Claude reads subtle messages better.')+
 rk(1270,2.0,'Next step','Pilot on real chats','All names and chats here are fictional. Real accuracy needs a pilot on your own data.')))
# 10 outro
S.append('<section id="s10" class="scene dark clip" data-start="%s" data-duration="%s" data-track-index="0"><div class="gl" data-layout-allow-overflow></div><div class="outro"><div class="a" data-at="0.3">%s</div><h2 class="display word"><span class="mask"><span class="w">Vendor CRM</span></span></h2><div class="otag a" data-at="1.3">Customer conversations, understood.</div><div class="otag2 a" data-at="1.9">React &middot; Node &middot; PostgreSQL &middot; Claude</div></div></section>'%(cuts[9],round(D-cuts[9],2),MK))
sfx=''.join('<audio id="sx%d" data-start="%s" data-duration="0.6" data-track-index="%d" data-volume="0.22" src="assets/sfx/card-slide-1.wav"></audio>'%(i,round(c-.35,2),11+i%6) for i,c in enumerate(cuts))
js=old[old.index('<script>\nwindow.__timelines'):old.index('</script></body>')]
js=js.replace('77.1',str(D)).replace('[0, 5, 11.5, 22, 32, 41, 50, 58.5, 66.5, 73]',str(cuts))
# packet block
a=js.index('// architecture packet'); b=js.index('window.__timelines["main"]')
pk='''// architecture packet (scene 5 starts 32)
const P=[0,1,2,3,4].map(i=>70+i*360+155-12);
tl.set("#pkt",{opacity:1,x:P[0]},35.6);
for(let i=1;i<5;i++)tl.to("#pkt",{x:P[i],duration:.7,ease:"power2.inOut"},35.6+i*.8-.5);
tl.to("#pkt",{opacity:0,duration:.3},39.1);
// scene 6: swap code windows
tl.to("#cwA",{opacity:0,duration:.3},36+4.1);
tl.to("#cwB",{opacity:1,duration:.3},40+4.3);
'''
pk=pk.replace('tl.to("#cwA",{opacity:0,duration:.3},36+4.1);','tl.to("#cwA",{opacity:0,duration:.3},46.0);').replace('tl.to("#cwB",{opacity:1,duration:.3},40+4.3);','tl.to("#cwB",{opacity:1,duration:.4},46.2);')
js=js[:a]+pk+js[b:]
out='<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920, height=1080"/><title>Vendor CRM demo</title>\n<script src="assets/vendor/gsap.min.js"></script><script src="assets/rms30.js"></script><style>%s</style></head><body>\n<div id="root" data-composition-id="main" data-start="0" data-duration="%s" data-width="1920" data-height="1080">\n%s\n<div id="wipe" data-layout-allow-occlusion class="clip" data-start="0" data-duration="%s" data-track-index="1"></div>\n<audio id="music" data-start="0" data-duration="%s" data-track-index="10" data-volume="0.45" data-fade-in="0.8" data-fade-out="2" src="assets/music/bed.mp3"></audio>\n%s\n</div>%s</script></body></html>'%(css,D,'\n'.join(S),D,D,sfx,js)
open('comp/index.html','w').write(out)
print(len(out))
