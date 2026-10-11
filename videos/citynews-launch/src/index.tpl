<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {
        font-family: "Schibsted Grotesk";
        src: url("assets/fonts/SchibstedGrotesk-normal.woff2") format("woff2");
        font-weight: 400 900;
        font-style: normal;
      }
      @font-face {
        font-family: "Source Serif 4";
        src: url("assets/fonts/SourceSerif4-normal.woff2") format("woff2");
        font-weight: 200 900;
        font-style: normal;
      }
      :root {
        --tinta: #0f1b2d;
        --urucum: #e8491d;
        --urucum-texto: #b33a12;
        --nevoa: #f3f5f8;
        --grafite: #4a4f57;
        --branco: #ffffff;
        --tinta-80: #27324a;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: var(--tinta);
      }
      #root {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        font-family: "Schibsted Grotesk", sans-serif;
        color: var(--tinta);
        background: var(--tinta);
      }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .fill { position: absolute; inset: 0; }

      /* 1 · Logo */
      #s1-urucum { background: var(--urucum); }
      #s1-tinta { background: var(--tinta); transform-origin: 50% 100%; }
      #s1-logo-wrap {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
      }
      #s1-logo { width: 640px; height: auto; display: block; overflow: visible; }

      /* 2 · Título cinético */
      #s2-bg { background: var(--tinta); }
      .word-stage {
        position: absolute; left: 0; right: 0; top: 0; bottom: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .word {
        position: absolute; left: 60px; right: 60px; top: 820px;
        text-align: center;
        font-weight: 800;
        font-size: 200px;
        line-height: 1;
        letter-spacing: -0.035em;
        color: var(--branco);
        opacity: 0;
        display: block;
      }
      .word.accent { color: var(--urucum); }
      .word .dot { color: var(--urucum); }
      #s2-kicker {
        position: absolute; left: 0; right: 0; top: 600px;
        text-align: center;
        font-size: 34px; font-weight: 700; letter-spacing: 0.22em;
        color: #9aa4b5;
      }
      #s2-bar {
        position: absolute; left: 340px; width: 400px; top: 1110px; height: 10px;
        background: var(--tinta-80); border-radius: 5px; overflow: hidden;
      }
      #s2-bar-fill {
        position: absolute; inset: 0; background: var(--urucum);
        transform-origin: 0 50%;
      }
      #s2-burst {
        position: absolute; width: 120px; height: 120px; border-radius: 50%;
        background: var(--urucum); left: 480px; top: 1500px; opacity: 0;
      }

      /* 3 · Recursos */
      #s3-bg { background: var(--nevoa); }
      #s3-wipe { background: var(--urucum); }
      .copy {
        position: absolute; left: 90px; right: 90px; top: 230px;
      }
      .eyebrow {
        font-size: 30px; font-weight: 700; letter-spacing: 0.18em;
        color: var(--urucum-texto); display: block;
      }
      .title {
        margin-top: 22px;
        font-size: 92px; font-weight: 800; line-height: 1.0; letter-spacing: -0.03em;
        color: var(--tinta); display: block;
      }
      .sub {
        margin-top: 22px;
        font-family: "Source Serif 4", serif;
        font-size: 40px; line-height: 1.3; color: var(--grafite); display: block;
      }
      .phone {
        position: absolute; left: 274px; top: 690px;
        width: 532px; height: 1114px;
        border-radius: 64px;
        background: var(--tinta);
        padding: 16px;
        box-shadow: 0 40px 80px rgba(15, 27, 45, 0.22);
      }
      .screen {
        position: relative; width: 500px; height: 1082px;
        border-radius: 48px; overflow: hidden; background: var(--branco);
      }
      .content { position: absolute; left: 0; top: 0; width: 500px; }
      .content img { display: block; width: 500px; height: auto; }
      .nav-strip { position: absolute; left: 0; bottom: 0; width: 500px; height: auto; display: block; }
      .ring {
        position: absolute;
        border: 5px solid var(--urucum);
        border-radius: 18px;
        opacity: 0;
      }

      /* 4 · CTA */
      #s4-bg { background: var(--tinta); }
      #s4-panel { background: var(--tinta); transform-origin: 50% 100%; }
      #s4-logo { position: absolute; left: 220px; top: 470px; width: 640px; height: auto; display: block; }
      #s4-cta {
        position: absolute; left: 70px; right: 70px; top: 850px;
        text-align: center; color: var(--branco);
        font-size: 150px; font-weight: 800; line-height: 1; letter-spacing: -0.035em;
        display: block;
      }
      #s4-sub {
        position: absolute; left: 90px; right: 90px; top: 1030px;
        text-align: center; color: #c9d0da;
        font-family: "Source Serif 4", serif; font-size: 46px; line-height: 1.3;
        display: block;
      }
      #s4-url {
        position: absolute; left: 110px; width: 860px; top: 1260px; height: 130px;
        border-radius: 65px; border: 4px solid var(--urucum);
        display: flex; align-items: center; justify-content: center; gap: 22px;
        color: var(--branco); font-size: 50px; font-weight: 700; letter-spacing: -0.01em;
      }
      #s4-url-dot { width: 24px; height: 24px; border-radius: 50%; background: var(--urucum); display: block; }
      #s4-foot {
        position: absolute; left: 0; right: 0; top: 1450px; text-align: center;
        color: #9aa4b5; font-size: 32px; font-weight: 600; letter-spacing: 0.04em; display: block;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="30" data-width="1080" data-height="1920">

      <!-- 1 · Logo 0–3s -->
      <div id="s1" class="scene clip" data-start="0" data-duration="3" data-track-index="0">
        <div id="s1-urucum" class="fill"></div>
        <div id="s1-tinta" class="fill"></div>
        <div id="s1-logo-wrap">
          {{LOGO_VERTICAL}}
        </div>
      </div>

      <!-- 2 · Título 3–8s -->
      <div id="s2" class="scene clip" data-start="3" data-duration="5" data-track-index="0">
        <div id="s2-bg" class="fill"></div>
        <span id="s2-kicker">CITYNEWS CUIABÁ</span>
        <span class="word" id="w1">Notícias</span>
        <span class="word" id="w2">de</span>
        <span class="word accent" id="w3">Cuiabá</span>
        <span class="word" id="w4">com</span>
        <span class="word" id="w5">origem</span>
        <span class="word" id="w6">sempre</span>
        <span class="word" id="w7">visível<span class="dot">.</span></span>
        <div id="s2-bar"><div id="s2-bar-fill"></div></div>
        <div id="s2-burst"></div>
      </div>

      <!-- 3 · Recursos 8–23s -->
      <div id="s3" class="scene clip" data-start="8" data-duration="15" data-track-index="0">
        <div id="s3-bg" class="fill"></div>

        <div class="copy" id="c1">
          <span class="eyebrow">PERGUNTAR AO CITYNEWS</span>
          <span class="title">Pergunte sobre Cuiabá.</span>
          <span class="sub">Cada frase da resposta mostra de onde veio.</span>
        </div>
        <div class="copy" id="c2">
          <span class="eyebrow">GUIA CUIABÁ</span>
          <span class="title">Os melhores lugares da cidade.</span>
          <span class="sub">Restaurantes, padarias e cafés, lista por lista.</span>
        </div>
        <div class="copy" id="c3">
          <span class="eyebrow">NEWSLETTERS</span>
          <span class="title">Cuiabá em 5 minutos.</span>
          <span class="sub">O resumo do dia no seu e-mail, às 7h.</span>
        </div>

        <div class="phone" id="p1" data-layout-allow-overflow>
          <div class="screen">
            <div class="content" id="p1-content" data-layout-allow-overflow>
              <img src="assets/ui/pergunte.png" alt="Tela Perguntar ao CityNews" />
              <div class="ring" id="r1a" style="left:22px; top:356px; width:456px; height:186px;"></div>
              <div class="ring" id="r1b" style="left:90px; top:542px; width:344px; height:72px; border-radius:40px;"></div>
            </div>
          </div>
        </div>
        <div class="phone" id="p2" data-layout-allow-overflow>
          <div class="screen">
            <div class="content" id="p2-content" data-layout-allow-overflow>
              <img src="assets/ui/guia-full.png" alt="Tela Guia Cuiabá" />
              <div class="ring" id="r2" style="left:18px; top:512px; width:464px; height:186px;"></div>
            </div>
            <img class="nav-strip" src="assets/ui/nav-explorar.png" alt="" />
          </div>
        </div>
        <div class="phone" id="p3" data-layout-allow-overflow>
          <div class="screen">
            <div class="content" id="p3-content" data-layout-allow-overflow>
              <img src="assets/ui/newsletter-full.png" alt="Tela Newsletters" />
              <div class="ring" id="r3" style="left:46px; top:1448px; width:414px; height:62px; border-radius:14px;"></div>
            </div>
            <img class="nav-strip" src="assets/ui/nav-perfil.png" alt="" />
          </div>
        </div>
        <div id="s3-wipe" class="fill" data-layout-allow-overflow></div>
      </div>

      <!-- 4 · CTA 23–30s -->
      <div id="s4" class="scene clip" data-start="23" data-duration="7" data-track-index="0">
        <div id="s4-bg" class="fill"></div>
        {{LOGO_HORIZONTAL}}
        <span id="s4-cta">Leia agora.</span>
        <span id="s4-sub">Notícia, agenda e serviço no mesmo lugar. Sem cadastro.</span>
        <div id="s4-url"><span id="s4-url-dot"></span><span>citynewscuiaba.vercel.app</span></div>
        <span id="s4-foot">O ponto da cidade.</span>
      </div>
      <!-- Narração (VoiceStudio · VoxCPM2) -->
      <audio id="vo1" src="assets/vo/final/vo1-marca.wav" data-start="1.2" data-duration="1.26" data-track-index="5" data-volume="1"></audio>
      <audio id="vo2" src="assets/vo/final/vo2-titulo.wav" data-start="3.15" data-duration="4.48" data-track-index="5" data-volume="1"></audio>
      <audio id="vo3" src="assets/vo/final/vo3-pergunte.wav" data-start="8.25" data-duration="4.92" data-track-index="5" data-volume="1"></audio>
      <audio id="vo4" src="assets/vo/final/vo4-guia.wav" data-start="13.3" data-duration="4.3" data-track-index="5" data-volume="1"></audio>
      <audio id="vo5" src="assets/vo/final/vo5-newsletter.wav" data-start="18.35" data-duration="3.17" data-track-index="5" data-volume="1"></audio>
      <audio id="vo6" src="assets/vo/final/vo6-cta.wav" data-start="23.35" data-duration="3.82" data-track-index="5" data-volume="1"></audio>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });

      // ---------- 1 · Logo (0–3s) ----------
      const arc = document.querySelector("#s1-logo .arc");
      const arcLen = 160; // comprimento aproximado do arco (r=32, ~286°)
      tl.fromTo("#s1-tinta", { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: "expo.inOut" }, 0.15);
      tl.fromTo(arc, { strokeDasharray: arcLen, strokeDashoffset: arcLen }, { strokeDashoffset: 0, duration: 0.6, ease: "power3.out" }, 0.55);
      tl.fromTo("#s1-logo .ponto", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.45, ease: "back.out(3)" }, 1.0);
      tl.fromTo("#s1-logo .wm-1", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "expo.out" }, 1.15);
      tl.fromTo("#s1-logo .wm-2", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, 1.35);
      tl.to("#s1-logo", { scale: 1.06, duration: 1.1, ease: "none", transformOrigin: "50% 50%" }, 1.6);
      tl.to("#s1-logo-wrap", { opacity: 0, y: -40, duration: 0.25, ease: "power2.in" }, 2.75);

      // ---------- 2 · Título cinético (3–8s) ----------
      // Tempos de cada palavra = transcrição da narração (vo2 começa em 3,15s)
      const words = [
        ["#w1", 3.15, 0.47],
        ["#w2", 3.62, 0.18],
        ["#w3", 3.8, 0.5],
        ["#w4", 4.3, 1.08],
        ["#w5", 5.38, 0.72],
        ["#w6", 6.1, 0.72],
        ["#w7", 6.82, 0.68],
      ];
      tl.fromTo("#s2-kicker", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 3.05);
      tl.fromTo("#s2-bar-fill", { scaleX: 0 }, { scaleX: 1, duration: 4.5, ease: "none" }, 3.0);
      words.forEach(([sel, t, d], i) => {
        const inDur = Math.min(0.28, d * 0.7);
        tl.fromTo(sel, { opacity: 0, yPercent: 60, scale: 0.86 }, { opacity: 1, yPercent: 0, scale: 1, duration: inDur, ease: "expo.out" }, t);
        if (i < words.length - 1) {
          tl.to(sel, { opacity: 0, yPercent: -55, scale: 1.04, duration: 0.12, ease: "power2.in" }, t + d - 0.1);
        }
      });
      tl.to(["#s2-kicker", "#s2-bar"], { opacity: 0, duration: 0.25, ease: "power2.in" }, 7.45);
      tl.to("#w7", { scale: 0.92, opacity: 0, duration: 0.3, ease: "power2.in" }, 7.5);
      tl.fromTo("#s2-burst", { opacity: 1, scale: 0 }, { opacity: 1, scale: 40, duration: 0.5, ease: "expo.in" }, 7.5);

      // ---------- 3 · Recursos (8–23s) ----------
      tl.fromTo("#s3-wipe", { yPercent: 0 }, { yPercent: -100, duration: 0.55, ease: "expo.inOut" }, 8.0);

      function copyIn(id, t) {
        tl.fromTo(`${id} .eyebrow`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, t);
        tl.fromTo(`${id} .title`, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, t + 0.08);
        tl.fromTo(`${id} .sub`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "expo.out" }, t + 0.18);
      }
      function copyOut(id, t) {
        tl.to(`${id} .eyebrow, ${id} .title, ${id} .sub`, { opacity: 0, x: -80, duration: 0.3, stagger: 0.04, ease: "power2.in" }, t);
      }
      function phoneIn(id, t, fromX) {
        tl.fromTo(id, { x: fromX, y: fromX === 0 ? 320 : 0, rotation: fromX === 0 ? 0 : 6, opacity: fromX === 0 ? 0 : 1 },
          { x: 0, y: 0, rotation: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, t);
      }
      function phoneOut(id, t) {
        tl.to(id, { x: -1100, rotation: -6, duration: 0.5, ease: "power3.in" }, t);
      }
      function ring(id, t) {
        tl.fromTo(id, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t);
      }

      // Recurso 1 · Perguntar (8–13s)
      gsap.set(["#p2", "#p3"], { x: 1100 });
      gsap.set(["#c2 .eyebrow", "#c2 .title", "#c2 .sub", "#c3 .eyebrow", "#c3 .title", "#c3 .sub"], { opacity: 0 });
      copyIn("#c1", 8.25);
      phoneIn("#p1", 8.35, 0);
      ring("#r1a", 9.3);
      tl.fromTo("#p1-content", { scale: 1, transformOrigin: "250px 520px" }, { scale: 1.16, duration: 3.2, ease: "power1.inOut" }, 9.4);
      ring("#r1b", 10.5);
      tl.to("#r1b", { backgroundColor: "rgba(232,73,29,0.12)", duration: 0.3, ease: "power1.out" }, 11.0);
      copyOut("#c1", 12.6);
      phoneOut("#p1", 12.55);

      // Recurso 2 · Guia (13–18s)
      copyIn("#c2", 12.95);
      phoneIn("#p2", 12.85, 1100);
      tl.fromTo("#p2-content", { y: 0 }, { y: -330, duration: 1.1, ease: "power2.inOut" }, 14.0);
      ring("#r2", 15.2);
      tl.to("#p2-content", { y: -380, duration: 2.2, ease: "power1.inOut" }, 15.4);
      copyOut("#c2", 17.6);
      phoneOut("#p2", 17.55);

      // Recurso 3 · Newsletters (18–23s)
      copyIn("#c3", 17.95);
      phoneIn("#p3", 17.85, 1100);
      tl.fromTo("#p3-content", { y: 0 }, { y: -1282, duration: 1.4, ease: "power2.inOut" }, 19.0);
      ring("#r3", 20.5);
      tl.to("#p3-content", { scale: 1.08, transformOrigin: "250px 1480px", duration: 1.6, ease: "power1.inOut" }, 20.6);
      tl.to("#p3", { y: 1300, duration: 0.5, ease: "power3.in" }, 22.5);
      tl.to("#c3", { opacity: 0, y: -40, duration: 0.35, ease: "power2.in" }, 22.55);

      // ---------- 4 · CTA (23–30s) ----------
      tl.fromTo("#s4-logo", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 23.1);
      tl.fromTo("#s4-cta", { opacity: 0, yPercent: 50, scale: 0.9 }, { opacity: 1, yPercent: 0, scale: 1, duration: 0.45, ease: "expo.out" }, 23.4);
      tl.fromTo("#s4-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 23.75);
      tl.fromTo("#s4-url", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 24.3);
      tl.fromTo("#s4-url-dot", { scale: 1 }, { scale: 1.5, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 5 }, 25.0);
      tl.fromTo("#s4-foot", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, 25.2);
      tl.to("#s4-cta", { scale: 1.03, duration: 4.5, ease: "none" }, 25.0);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
