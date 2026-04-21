// ─────────────────────────────────────────────────────────────────────────────
// CSS
// The whole stylesheet is kept in a single template string so the whole app
// ships with one component and no external CSS file. Class names mirror the
// JSX elements that use them (`.pa` = page, `.pg` = playgrid, etc.).
// ─────────────────────────────────────────────────────────────────────────────

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

.pa{min-height:100vh;background:radial-gradient(ellipse 100% 55% at 50% -5%,#200840 0%,#07050e 65%),radial-gradient(ellipse 60% 40% at 20% 40%,rgba(200,68,255,.12),transparent 70%),radial-gradient(ellipse 50% 40% at 80% 60%,rgba(34,153,255,.08),transparent 70%);display:flex;flex-direction:column;align-items:center;padding:22px 10px 28px;gap:14px;font-family:'Inter',sans-serif;color:#b09acc;user-select:none;-webkit-user-select:none;overflow-x:hidden;position:relative;}
/* Tone down the PRISM title in the HUD — it's a gameplay header, not the
   splash logo, so use smaller type + less letter-spacing. */
.pa .pt{font-size:clamp(1.4rem,5.5vw,1.9rem);letter-spacing:.32em;padding-left:.32em;margin-bottom:4px;}

/* FEVER vignette */
.pa.fever::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,80,0,.3) 100%);pointer-events:none;z-index:500;animation:fvign .5s ease-in-out infinite alternate;}
@keyframes fvign{from{opacity:.6;}to{opacity:1;}}

.pt{font-family:'Orbitron',sans-serif;font-weight:900;font-size:clamp(2rem,8vw,2.8rem);letter-spacing:.4em;padding-left:.4em;background:linear-gradient(120deg,#ff66cc 0%,#aa44ff 35%,#5577ff 65%,#33eebb 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 18px rgba(160,80,255,.75));line-height:1;}
.ps{font-size:.57rem;letter-spacing:.18em;padding-left:.18em;color:#3a2850;text-align:center;margin-top:4px;}

.sb{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.03);border:1px solid rgba(160,80,255,.14);padding:8px 14px;width:100%;max-width:336px;}
.sb-left{display:flex;flex-direction:column;}
.sl{font-size:.54rem;letter-spacing:.14em;color:#442266;}
.sv{font-family:'Orbitron',sans-serif;font-size:1.45rem;font-weight:700;color:#cc88ff;text-shadow:0 0 14px rgba(200,100,255,.6);}
.co{font-family:'Orbitron',sans-serif;font-size:.7rem;font-weight:700;color:#ffcc22;animation:cpulse .35s ease;letter-spacing:.06em;padding-left:.06em;}
@keyframes cpulse{from{transform:scale(1.5);}to{transform:scale(1);}}
.sb-btns{display:flex;gap:5px;}
.icon-btn{background:transparent;border:1px solid rgba(160,80,255,.28);color:#664488;font-size:.85rem;cursor:pointer;padding:5px 9px;border-radius:3px;transition:all .2s;line-height:1;font-family:'Orbitron',sans-serif;}
.icon-btn:hover{border-color:rgba(160,80,255,.65);color:#aa66cc;background:rgba(160,80,255,.09);}

/* FEVER badge */
.fever-badge{font-family:'Orbitron',sans-serif;font-size:.62rem;font-weight:900;letter-spacing:.12em;padding:3px 10px;background:rgba(255,80,0,.2);border:1px solid rgba(255,120,0,.6);color:#ff8844;animation:fbadge .4s ease-in-out infinite alternate;}
@keyframes fbadge{from{box-shadow:0 0 6px rgba(255,80,0,.4);}to{box-shadow:0 0 16px rgba(255,80,0,.9),0 0 30px rgba(255,120,0,.4);}}

/* Timer */
.tw{width:100%;max-width:336px;display:flex;flex-direction:column;gap:3px;}
.trow{display:flex;align-items:center;justify-content:space-between;font-size:.52rem;letter-spacing:.08em;color:#554477;}
.tsec{font-family:'Orbitron',sans-serif;font-size:.6rem;font-weight:700;}
.tsec.ok{color:#8866cc;}.tsec.warn{color:#ffcc22;}.tsec.danger{color:#ff4466;}
.ttrack{width:100%;height:6px;background:rgba(255,255,255,.05);border:1px solid rgba(160,80,255,.12);border-radius:4px;overflow:hidden;}
.tbar{height:100%;border-radius:4px;transform-origin:left;will-change:transform;transition:transform .35s ease-out;}
.tbar.ok   {background:linear-gradient(90deg,#4422aa,#9966ff);}
.tbar.warn {background:linear-gradient(90deg,#aa6600,#ffcc22);}
.tbar.danger{background:linear-gradient(90deg,#aa0022,#ff4466);animation:tpulse .32s ease-in-out infinite;}
.tbar.fever{background:linear-gradient(90deg,#ff4400,#ffcc00,#ff8800,#ff4400);background-size:200% 100%;animation:feverBar .45s linear infinite;}
@keyframes tpulse{0%,100%{opacity:1;}50%{opacity:.42;}}
@keyframes feverBar{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* Toast — single fixed position, never moves layout */
.bn-slot{width:100%;max-width:336px;height:28px;display:flex;align-items:center;justify-content:center;position:relative;}
.bn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;font-family:'Orbitron',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:5px 18px;background:rgba(200,100,255,.16);border:1px solid rgba(200,100,255,.38);color:#cc88ff;animation:bnIn .18s ease;backdrop-filter:blur(8px);}
.bn.zap    {background:rgba(34,153,255,.16);border-color:rgba(34,153,255,.45);color:#66bbff;}
.bn.bomb   {background:rgba(255,136,51,.16);border-color:rgba(255,136,51,.45);color:#ffaa66;}
.bn.inferno{background:rgba(255,60,0,.18);border-color:rgba(255,100,0,.55);color:#ff8844;}
.bn.vortex {background:rgba(180,0,255,.14);border-color:rgba(220,50,255,.5);color:#ee88ff;}
.bn.fever  {background:rgba(255,80,0,.2);border-color:rgba(255,140,0,.7);color:#ffaa44;font-size:.85rem;}
.bn.milestone{background:rgba(255,220,0,.14);border-color:rgba(255,220,0,.55);color:#ffee44;}
.bn.bad    {background:rgba(255,60,60,.12);border-color:rgba(255,60,60,.3);color:#ff9999;}
@keyframes bnIn{from{opacity:0;transform:translate(-50%,-65%);}to{opacity:1;transform:translate(-50%,-50%);}}

/* Board */
.board-wrap{position:relative;}
.aura{position:absolute;border-radius:50%;pointer-events:none;z-index:0;filter:blur(55px);animation:auraDrift ease-in-out infinite;}
.aura-p{width:300px;height:220px;top:10%;left:-35%;background:rgba(200,68,255,.28);animation-duration:10s;}
.aura-b{width:220px;height:310px;top:-22%;left:28%;background:rgba(34,153,255,.22);animation-duration:14s;animation-delay:-5s;}
.aura-g{width:240px;height:170px;top:65%;left:40%;background:rgba(34,238,136,.16);animation-duration:8.5s;animation-delay:-2s;}
.aura-r{width:180px;height:180px;top:38%;left:60%;background:rgba(255,34,85,.14);animation-duration:12s;animation-delay:-7s;}
@keyframes auraDrift{0%,100%{transform:translate(0,0) scale(1);opacity:.8;}35%{transform:translate(8%,7%) scale(1.14);opacity:1;}70%{transform:translate(-6%,-9%) scale(.88);opacity:.75;}}

.pg{
  background:rgba(0,0,0,.52);border:1px solid rgba(160,80,255,.22);
  border-radius:6px;position:relative;z-index:1;touch-action:none;
  box-shadow:0 0 0 1px rgba(80,0,180,.22),0 0 70px rgba(80,0,180,.42),inset 0 0 55px rgba(0,0,0,.88);
  transition:border-color .3s;overflow:hidden;
}
.pg.fever-board{border-color:rgba(255,100,0,.55);box-shadow:0 0 0 1px rgba(255,80,0,.3),0 0 50px rgba(255,80,0,.35),inset 0 0 55px rgba(0,0,0,.88);}
.pg.shake{animation:boardShake .38s ease;}
@keyframes boardShake{0%,100%{transform:translate(0,0);}14%{transform:translate(-5px,3px);}28%{transform:translate(5px,-3px);}42%{transform:translate(-4px,4px);}57%{transform:translate(4px,-2px);}71%{transform:translate(-2px,2px);}85%{transform:translate(2px,-1px);}}

/* Floating score popups */
.floater{
  position:absolute;font-family:'Orbitron',sans-serif;font-weight:700;font-size:.75rem;
  pointer-events:none;z-index:200;white-space:nowrap;
  animation:floatUp 1.1s ease forwards;
  text-shadow:0 0 8px currentColor;
}
.floater.fever{font-size:.95rem;color:#ffaa44;}
.floater.vortex{font-size:1rem;color:#ee88ff;}
.floater.inferno{color:#ff8844;}
.floater.bomb{color:#ffaa66;}
.floater.zap{color:#66bbff;}
.floater.normal{color:#cc88ff;}
@keyframes floatUp{0%{transform:translateY(0) scale(1);opacity:1;}40%{opacity:1;}100%{transform:translateY(-70px) scale(.75);opacity:0;}}

/* Pause / game-over overlay. Keep the backdrop blur STATIC and the fade
   short (150 ms) — animating backdrop-filter is a GPU trap on Android and
   is the main cause of pause-open jank. */
.overlay{position:absolute;inset:0;border-radius:6px;background:rgba(4,2,10,.94);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:50;animation:goIn .15s ease-out;will-change:opacity;}
@keyframes goIn{from{opacity:0;}to{opacity:1;}}
.ov-stagger>*{opacity:0;animation:staggerIn .5s ease forwards;}
.ov-stagger>*:nth-child(1){animation-delay:.3s;}
.ov-stagger>*:nth-child(2){animation-delay:.5s;}
.ov-stagger>*:nth-child(3){animation-delay:.7s;}
.ov-stagger>*:nth-child(4){animation-delay:.85s;}
.ov-stagger>*:nth-child(5){animation-delay:1s;}
.ov-stagger>*:nth-child(6){animation-delay:1.15s;}
@keyframes staggerIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
.ov-title{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;letter-spacing:.15em;padding-left:.15em;text-shadow:0 0 22px currentColor;}
.ov-title.timeout{color:#ff4466;}.ov-title.nomoves{color:#ffaa22;}.ov-title.pause{color:#9966ff;}
.ov-sub{font-size:.62rem;letter-spacing:.1em;color:#443355;margin-top:-4px;}
.ov-score{font-family:'Orbitron',sans-serif;font-size:.95rem;color:#cc88ff;letter-spacing:.1em;padding-left:.1em;margin-top:4px;}

/* Main menu.
   - .menu has the gradient.
   - .menu::before is a black overlay that fades off on mount (CSS
     animation, not JS state — runs on first paint, cannot get stuck).
   - Children use animation-fill-mode: backwards so they're invisible
     during the delay, fade in, then return to the default opacity 1
     after the animation — so even if the keyframes fail to run, the
     elements still end up visible.
*/
.menu{
  position:fixed;inset:0;
  background:radial-gradient(ellipse 100% 60% at 50% 40%,#2a0a4a 0%,#07050e 70%);
  display:flex;flex-direction:column;align-items:center;gap:40px;
  z-index:700;padding:25vh 20px 32px;
}
.menu .pt{font-size:clamp(3rem,14vw,4.8rem);margin-bottom:15vh;}

/* Black overlay that covers EVERYTHING (gradient + children) on mount,
   then fades off. Needs to sit above the children (high z-index) so the
   user doesn't see them pop in before the fade completes. */
.menu::before{
  content:"";position:absolute;inset:0;background:#000;z-index:10;pointer-events:none;
  animation:menuCoverOut 1.1s cubic-bezier(.45,0,.2,1) forwards;
}
.menu > *{position:relative;z-index:1;}
@keyframes menuCoverOut{
  0%  {opacity:1;}
  15% {opacity:1;}
  100%{opacity:0;}
}

/* Staggered element reveal. backwards fill-mode keeps them invisible
   during the delay, fades them in, then returns to CSS default at the
   end. If the animation never runs, elements stay visible. */
.menu-stagger{animation:menuFadeIn .9s cubic-bezier(.32,.72,.35,1) backwards;}
.menu-stagger:nth-of-type(1){animation-delay:.35s;}
.menu-stagger:nth-of-type(2){animation-delay:.55s;}
.menu-stagger:nth-of-type(3){animation-delay:.75s;}
.menu-stagger:nth-of-type(4){animation-delay:.95s;}
@keyframes menuFadeIn{
  0%  {opacity:0;transform:translateY(10px);}
  100%{opacity:1;transform:translateY(0);}
}
.menu .ps{font-size:.7rem;margin-top:8px;}
.menu-best{font-family:'Orbitron',sans-serif;font-size:.72rem;letter-spacing:.14em;color:#8866cc;margin-top:16px;text-align:center;}
.menu-best b{color:#ffcc44;text-shadow:0 0 12px rgba(255,200,68,.6);font-size:1rem;display:block;margin-top:10px;}
.menu-btn{font-family:'Orbitron',sans-serif;font-size:.9rem;font-weight:900;letter-spacing:.2em;padding:16px 48px;padding-left:calc(.2em + 48px);background:transparent;border:2px solid rgba(200,120,255,.6);color:#ddaaff;cursor:pointer;animation:menuPulse 1.6s ease-in-out infinite;margin-top:12px;}
@keyframes menuPulse{0%,100%{box-shadow:0 0 20px rgba(200,120,255,.35);}50%{box-shadow:0 0 35px rgba(200,120,255,.75);}}
.menu-link{background:none;border:none;color:#6a4a8c;font-size:.65rem;letter-spacing:.14em;cursor:pointer;text-transform:uppercase;padding:10px;font-family:'Inter',sans-serif;}
/* Keeps "How to Play" + "About" tightly grouped. margin-top:auto pushes the
   group to the bottom of the menu flex column, separating it from PLAY. */
.menu-footer{display:flex;flex-direction:column;align-items:center;gap:4px;margin-top:auto;}
.menu-link:hover{color:#aa88cc;}

/* Tutorial */
.tut{position:fixed;inset:0;background:rgba(4,2,10,.92);backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:800;padding:30px;}
.tut-card{max-width:340px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;}
.tut-num{font-family:'Orbitron',sans-serif;font-size:.65rem;color:#664488;letter-spacing:.2em;margin-bottom:8px;}
.tut-title{font-family:'Orbitron',sans-serif;font-size:1.2rem;font-weight:900;color:#cc88ff;letter-spacing:.1em;margin-bottom:12px;text-shadow:0 0 18px rgba(200,100,255,.6);}
.tut-body{font-size:.82rem;line-height:1.5;color:#aa99cc;margin-top:10px;}
.ts-row{display:flex;align-items:center;justify-content:center;gap:6px;margin:10px 0;}
.ts-arrow{font-family:'Orbitron',sans-serif;color:#cc88ff;font-size:1.1rem;margin:0 6px;text-shadow:0 0 8px rgba(200,100,255,.8);}
.ts-swap{color:#ffcc44;font-size:1.3rem;margin:0 2px;text-shadow:0 0 10px rgba(255,204,68,.9);animation:swapBob .9s ease-in-out infinite;}
@keyframes swapBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-2px);}}
.ts-label{font-family:'Orbitron',sans-serif;font-size:.55rem;letter-spacing:.1em;color:#8866bb;margin-top:3px;text-transform:uppercase;}
.ts-result{font-family:'Orbitron',sans-serif;font-size:.72rem;font-weight:900;color:#44ddaa;letter-spacing:.1em;text-shadow:0 0 10px rgba(68,221,170,.7);}
.ts-icon{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:18px;background:rgba(200,100,255,.15);border:1px solid rgba(200,100,255,.4);}
.ts-icon.zap{background:rgba(68,200,255,.2);border-color:rgba(68,200,255,.5);}
.ts-icon.bomb{background:rgba(255,120,60,.2);border-color:rgba(255,120,60,.5);}
.ts-icon.inferno{background:rgba(255,60,40,.2);border-color:rgba(255,60,40,.5);}
.ts-icon.vortex{background:rgba(180,80,255,.25);border-color:rgba(180,80,255,.6);}
.ts-highlight{outline:2px solid #ffcc44;outline-offset:2px;border-radius:6px;animation:tsGlow 1.2s ease-in-out infinite;}
@keyframes tsGlow{0%,100%{outline-color:#ffcc44;box-shadow:0 0 0 rgba(255,204,68,0);}50%{outline-color:#ffee88;box-shadow:0 0 12px rgba(255,204,68,.7);}}
.ts-lock{position:relative;width:36px;height:36px;}
.ts-lock-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#222;border:1.5px solid #ffcc44;color:#ffcc44;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;}
.nb{color:#ffcc44;font-weight:700;text-shadow:0 0 10px currentColor;}

/* Shared overlay button styling */
.ov-btn{font-family:'Orbitron',sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.18em;padding:10px 28px;padding-left:calc(.18em + 28px);background:transparent;border:1px solid rgba(160,80,255,.45);color:#aa88ff;cursor:pointer;transition:all .2s;margin-top:4px;}
.ov-btn:hover{background:rgba(160,80,255,.12);box-shadow:0 0 18px rgba(160,80,255,.35);}
.ov-btn.danger{border-color:rgba(255,68,102,.5);color:#ff6688;}
.ov-btn.danger:hover{background:rgba(255,68,102,.12);}

/* Board background bloom — subtle pulsing gradient behind the canvas. */
.board-bloom{position:absolute;inset:-40px;border-radius:32px;pointer-events:none;z-index:-1;background:radial-gradient(ellipse at 30% 30%,rgba(170,90,255,.22),transparent 55%),radial-gradient(ellipse at 70% 70%,rgba(60,170,255,.18),transparent 60%);filter:blur(28px);animation:bloomDrift 14s ease-in-out infinite;}
@keyframes bloomDrift{0%,100%{transform:scale(1) translate(0,0);opacity:.85;}50%{transform:scale(1.08) translate(2%,-2%);opacity:1;}}

/* Tutorial gem overlays — used by <TutGem> to preview powerups. */
.sp-z{position:absolute;inset:0;pointer-events:none;z-index:3;}
.sp-mult{position:absolute;top:4%;right:4%;width:42%;height:42%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-weight:900;font-size:13px;color:#fff;background:linear-gradient(135deg,#ffd700,#ff8800);border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 10px 2px rgba(255,215,0,.9),inset 0 0 4px rgba(255,255,255,.5);text-shadow:0 1px 2px rgba(0,0,0,.7);animation:multPulse 1.1s ease-in-out infinite;pointer-events:none;z-index:3;}
.sp-mult5{background:linear-gradient(135deg,#66ddff,#2266ff);box-shadow:0 0 14px 3px rgba(80,180,255,.95),inset 0 0 5px rgba(255,255,255,.6);font-size:12px;}
.sp-mult10{background:linear-gradient(135deg,#ff66dd,#aa00aa);box-shadow:0 0 18px 4px rgba(255,100,220,.95),0 0 32px 6px rgba(170,0,170,.55);font-size:11px;}
@keyframes mult10Spin{to{transform:rotate(360deg);}}
.mw-badge{font-family:'Orbitron',sans-serif;font-size:.64rem;font-weight:900;letter-spacing:.08em;padding:4px 10px;border:1px solid currentColor;color:#ffcc44;animation:mwPulse .5s ease-in-out infinite alternate;}
.mw-badge.m5{color:#66ccff;}
.mw-badge.m10{color:#ee88ff;animation-duration:.25s;}
@keyframes mwPulse{from{box-shadow:0 0 6px currentColor;}to{box-shadow:0 0 18px currentColor,0 0 30px currentColor;}}
.pg.flash-mult2 {box-shadow:0 0 0 2px #ffcc44,0 0 50px rgba(255,204,68,.7),inset 0 0 55px rgba(0,0,0,.88);}
.pg.flash-mult5 {box-shadow:0 0 0 2px #66ccff,0 0 70px rgba(102,204,255,.85),inset 0 0 55px rgba(0,0,0,.88);}
.pg.flash-mult10{box-shadow:0 0 0 3px #fff,0 0 90px rgba(255,255,255,.9),0 0 140px rgba(200,100,255,.7),inset 0 0 55px rgba(0,0,0,.88);}
.sp-shuffle{position:absolute;top:4%;right:4%;width:46%;height:46%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-weight:900;font-size:18px;color:#fff;background:conic-gradient(from 0deg,#00d4ff,#9d00ff,#ff00aa,#00d4ff);border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 12px 3px rgba(157,0,255,.85),inset 0 0 5px rgba(255,255,255,.5);text-shadow:0 1px 3px rgba(0,0,0,.7);animation:shufSpin 1.6s linear infinite;pointer-events:none;z-index:3;}
@keyframes shufSpin{to{transform:rotate(360deg);}}
@keyframes multPulse{0%,100%{transform:scale(1);filter:brightness(1);}50%{transform:scale(1.08);filter:brightness(1.25);}}
.sp-bb{position:absolute;border-radius:2px;}
.sp-bb.h{top:50%;left:10%;right:10%;height:3px;transform:translateY(-50%);background:linear-gradient(90deg,rgba(0,220,255,.6) 0%,#fff 18%,#fff 82%,rgba(0,220,255,.6) 100%);box-shadow:0 0 5px 1px rgba(0,220,255,.85),0 0 10px rgba(0,180,255,.4);animation:zapPulse 0.7s ease-in-out infinite;}
.sp-bb.v{left:50%;top:10%;bottom:10%;width:3px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(0,220,255,.6) 0%,#fff 18%,#fff 82%,rgba(0,220,255,.6) 100%);box-shadow:0 0 5px 1px rgba(0,220,255,.85),0 0 10px rgba(0,180,255,.4);animation:zapPulse 0.9s ease-in-out infinite;animation-delay:-0.22s;}
.sp-z::before,.sp-z::after{content:"";position:absolute;width:5px;height:5px;border-radius:50%;top:calc(50% - 2.5px);background:radial-gradient(circle,#fff 0%,rgba(0,220,255,.8) 50%,transparent 80%);box-shadow:0 0 6px 1px rgba(0,220,255,.75);animation:zapSpark 1s ease-in-out infinite;}
.sp-z::before{left:5%;}
.sp-z::after{right:5%;animation-delay:-0.5s;}
@keyframes zapPulse{0%,100%{filter:brightness(1);opacity:.88;}50%{filter:brightness(1.2);opacity:1;}}
@keyframes zapSpark{0%,100%{transform:scale(1);opacity:.8;}50%{transform:scale(1.2);opacity:1;}}
.sp-bm{position:absolute;top:16%;left:16%;right:16%;bottom:16%;border:2.5px solid rgba(255,255,255,.95);border-radius:50%;box-shadow:0 0 10px 3px rgba(255,255,255,.65),inset 0 0 8px rgba(255,255,255,.22);animation:bmRing 1.3s ease-in-out infinite;pointer-events:none;z-index:3;}
@keyframes bmRing{0%,100%{transform:scale(1);opacity:.8;}50%{transform:scale(1.1);opacity:1;}}

/* Inferno: fast orange/red spinning ring */
.sp-inf{position:absolute;top:8%;left:8%;right:8%;bottom:8%;border-radius:50%;background:conic-gradient(#ff2200,#ff8800,#ffcc00,#ff5500,#ff2200);animation:infSpin .7s linear infinite;opacity:.92;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#fff calc(100% - 4px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#fff calc(100% - 4px));filter:brightness(1.3);}
@keyframes infSpin{to{transform:rotate(360deg);}}

/* Vortex: full rainbow double ring, fastest */
.sp-vortex-outer{position:absolute;top:5%;left:5%;right:5%;bottom:5%;border-radius:50%;background:conic-gradient(#ff2255,#ff8800,#ffcc22,#22ee88,#2299ff,#cc44ff,#ff2255);animation:vortexSpin .45s linear infinite;opacity:.95;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#fff calc(100% - 5px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#fff calc(100% - 5px));filter:brightness(1.5);}
.sp-vortex-inner{position:absolute;top:22%;left:22%;right:22%;bottom:22%;border-radius:50%;background:conic-gradient(#ffcc22,#2299ff,#cc44ff,#22ee88,#ff2255,#ffcc22);animation:vortexSpin .45s linear infinite reverse;opacity:.8;pointer-events:none;z-index:3;mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#fff calc(100% - 3px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#fff calc(100% - 3px));}
@keyframes vortexSpin{to{transform:rotate(360deg);}}

/* Legend */
.lg{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:14px;}
.li{display:flex;align-items:center;gap:4px;font-size:.54rem;letter-spacing:.04em;color:#3a2850;}
.ng{font-family:'Orbitron',sans-serif;font-size:.65rem;font-weight:700;letter-spacing:.18em;padding:9px 28px;padding-left:calc(.18em + 28px);background:transparent;border:1px solid rgba(160,80,255,.4);color:#9966cc;cursor:pointer;transition:all .2s;}
.ng:hover{background:rgba(160,80,255,.1);color:#cc88ff;border-color:rgba(160,80,255,.7);}
`;
