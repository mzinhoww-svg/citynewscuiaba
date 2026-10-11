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
        --tinta-80: #27324a;
        --tinta-60: #3b465c;
        --urucum: #e8491d;
        --urucum-texto: #b33a12;
        --nevoa: #f3f5f8;
        --grafite: #4a4f57;
        --grafite-2: #7d8591;
        --branco: #ffffff;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--tinta); }
      #root {
        width: 100%; height: 100%; position: relative; overflow: hidden;
        font-family: "Schibsted Grotesk", sans-serif; color: var(--tinta); background: var(--tinta);
      }
      .scene { position: absolute; inset: 0; overflow: hidden; }
      .fill { position: absolute; inset: 0; }

      /* ---------- 1 · O ponto da cidade ---------- */
      #s1-bg { background: var(--tinta); }
      #s1-stage { position: absolute; inset: 0; }
      #s1-map { position: absolute; left: 40px; top: 465px; width: 1000px; height: 990px; }
      #s1-map svg { width: 100%; height: 100%; display: block; overflow: visible; }
      #s1-map .st { fill: none; stroke: var(--tinta-60); stroke-width: 1.2; stroke-linejoin: round; }
      #s1-map .mt { fill: var(--tinta-80); stroke: var(--grafite-2); stroke-width: 1.6; stroke-linejoin: round; }
      #s1-ripple, #s1-ripple2 {
        position: absolute; left: 470px; top: 972px; width: 40px; height: 40px; margin: -20px 0 0 -20px;
        border-radius: 50%; border: 4px solid var(--urucum); opacity: 0;
      }
      #s1-dot {
        position: absolute; left: 470px; top: 972px; width: 40px; height: 40px; margin: -20px 0 0 -20px;
        border-radius: 50%; background: var(--urucum); opacity: 0;
      }
      #s1-label {
        position: absolute; left: 500px; top: 940px; color: var(--nevoa);
        font-size: 30px; font-weight: 700; letter-spacing: 0.08em; opacity: 0; white-space: nowrap;
      }
      #s1-logo-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      #s1-logo { width: 640px; height: auto; display: block; overflow: visible; }
      #s1-tag {
        position: absolute; left: 0; right: 0; top: 1200px; text-align: center; color: #9aa4b5;
        font-family: "Source Serif 4", serif; font-size: 44px; opacity: 0; display: block;
      }

      /* ---------- 2 · Título cinético ---------- */
      #s2-bg { background: var(--tinta); }
      .word {
        position: absolute; left: 60px; right: 60px; top: 820px; text-align: center;
        font-weight: 800; font-size: 200px; line-height: 1; letter-spacing: -0.035em;
        color: var(--branco); opacity: 0; display: block;
      }
      .word.accent { color: var(--urucum); }
      .word .dot { color: var(--urucum); }
      #s2-kicker {
        position: absolute; left: 0; right: 0; top: 600px; text-align: center;
        font-size: 34px; font-weight: 700; letter-spacing: 0.22em; color: #9aa4b5;
      }
      #s2-bar { position: absolute; left: 340px; width: 400px; top: 1110px; height: 10px; background: var(--tinta-80); border-radius: 5px; overflow: hidden; }
      #s2-bar-fill { position: absolute; inset: 0; background: var(--urucum); transform-origin: 0 50%; }
      #s2-burst { position: absolute; width: 120px; height: 120px; border-radius: 50%; background: var(--urucum); left: 480px; top: 1500px; opacity: 0; }

      /* ---------- 3 · Recursos ---------- */
      #s3-bg { background: var(--nevoa); }
      #s3-wipe { background: var(--urucum); }
      .copy { position: absolute; left: 90px; right: 90px; top: 230px; }
      .eyebrow { font-size: 30px; font-weight: 700; letter-spacing: 0.18em; color: var(--urucum-texto); display: block; }
      .title { margin-top: 22px; font-size: 92px; font-weight: 800; line-height: 1.0; letter-spacing: -0.03em; color: var(--tinta); display: block; }
      .sub { margin-top: 22px; font-family: "Source Serif 4", serif; font-size: 40px; line-height: 1.3; color: var(--grafite); display: block; }
      .phone {
        position: absolute; left: 274px; top: 600px; width: 532px; height: 1114px; border-radius: 64px;
        background: var(--tinta); padding: 16px; box-shadow: 0 40px 80px rgba(15, 27, 45, 0.22);
      }
      .screen { position: relative; width: 500px; height: 1082px; border-radius: 48px; overflow: hidden; background: var(--branco); }
      .content { position: absolute; left: 0; top: 0; width: 500px; }
      .content img { display: block; width: 500px; height: auto; }
      .nav-strip { position: absolute; left: 0; bottom: 0; width: 500px; height: auto; display: block; }
      .ring { position: absolute; border: 5px solid var(--urucum); border-radius: 18px; opacity: 0; }

      /* legendas karaokê */
      #s3-caps { position: absolute; left: 60px; right: 60px; top: 1640px; height: 100px; }
      .cap {
        position: absolute; left: 0; right: 0; top: 0; height: 100px;
        display: flex; align-items: center; justify-content: center; opacity: 0;
      }
      .cap-pill {
        display: inline-flex; align-items: center; gap: 0.3em; height: 100px; padding: 0 40px;
        border-radius: 50px; background: var(--branco); box-shadow: 0 10px 30px rgba(15, 27, 45, 0.16);
        font-size: 46px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap;
      }
      .cap-w { color: var(--grafite-2); display: inline-block; }

      /* ---------- 4 · CTA ---------- */
      #s4-bg { background: var(--tinta); }
      #s4-art { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; object-fit: cover; opacity: 0; display: block; }
      #s4-veil { position: absolute; inset: 0; background: var(--tinta); opacity: 0.78; }
      #s4-logo { position: absolute; left: 220px; top: 330px; width: 640px; height: auto; display: block; }
      #s4-cta {
        position: absolute; left: 70px; right: 70px; top: 700px; text-align: center; color: var(--branco);
        font-size: 150px; font-weight: 800; line-height: 1; letter-spacing: -0.035em; display: block;
      }
      #s4-sub {
        position: absolute; left: 90px; right: 90px; top: 890px; text-align: center; color: #c9d0da;
        font-family: "Source Serif 4", serif; font-size: 46px; line-height: 1.3; display: block;
      }
      #s4-url {
        position: absolute; left: 110px; width: 860px; top: 1110px; height: 130px; border-radius: 65px;
        border: 4px solid var(--urucum); display: flex; align-items: center; justify-content: center; gap: 22px;
        color: var(--branco); font-size: 50px; font-weight: 700; letter-spacing: -0.01em;
      }
      #s4-url-dot { width: 24px; height: 24px; border-radius: 50%; background: var(--urucum); display: block; }
      #s4-qr-plate { position: absolute; left: 350px; top: 1290px; width: 380px; height: 380px; border-radius: 36px; background: var(--tinta); opacity: 0; }
      #s4-qr { position: absolute; left: 390px; top: 1330px; width: 300px; height: 300px; opacity: 0; }
      #s4-qr svg { width: 100%; height: 100%; display: block; }
      #s4-qr-label {
        position: absolute; left: 0; right: 0; top: 1660px; text-align: center; color: #9aa4b5;
        font-size: 32px; font-weight: 600; letter-spacing: 0.04em; display: block; opacity: 0;
      }

      /* shimmer-sweep (registro HyperFrames) */
      .shimmer-sweep-target { position: relative; display: inline-block; }
      .shimmer-sweep-target .shimmer-mask {
        position: absolute; inset: 0; pointer-events: none; mix-blend-mode: overlay;
        background: linear-gradient(
          var(--shimmer-angle, 110deg),
          transparent 0%,
          transparent calc(var(--shimmer-pos, -20%) - var(--shimmer-width, 18%) / 2),
          var(--shimmer-color, rgba(255, 255, 255, 0.85)) var(--shimmer-pos, -20%),
          transparent calc(var(--shimmer-pos, -20%) + var(--shimmer-width, 18%) / 2),
          transparent 100%
        );
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="30" data-width="1080" data-height="1920">

      <!-- 1 · O ponto da cidade 0–3.4s -->
      <div id="s1" class="scene clip" data-start="0" data-duration="3.4" data-track-index="0">
        <div id="s1-bg" class="fill"></div>
        <div id="s1-stage" data-layout-allow-overflow>
          <div id="s1-map" data-layout-allow-overflow>{{MAP}}</div>
          <div id="s1-ripple"></div>
          <div id="s1-ripple2"></div>
          <div id="s1-label">CUIABÁ · MT</div>
          <div id="s1-logo-wrap">{{LOGO_VERTICAL}}</div>
          <div id="s1-dot"></div>
          <span id="s1-tag">O ponto da cidade.</span>
        </div>
      </div>

      <!-- 2 · Título 3.4–8s -->
      <div id="s2" class="scene clip" data-start="3.4" data-duration="4.6" data-track-index="0">
        <div id="s2-bg" class="fill"></div>
        <span id="s2-kicker">CITYNEWS CUIABÁ</span>
        <span class="word" id="w1">Notícias</span>
        <span class="word" id="w2">de</span>
        <span class="word accent" id="w3"><span class="shimmer-sweep-target">Cuiabá</span></span>
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

        <div id="s3-caps" data-layout-allow-overflow></div>
        <div id="s3-wipe" class="fill" data-layout-allow-overflow></div>
      </div>

      <!-- 4 · CTA 23–30s -->
      <div id="s4" class="scene clip" data-start="23" data-duration="7" data-track-index="0">
        <div id="s4-bg" class="fill"></div>
        <img id="s4-art" src="assets/art/cuiaba.jpg" alt="" />
        <div id="s4-veil"></div>
        {{LOGO_HORIZONTAL}}
        <span id="s4-cta"><span class="shimmer-sweep-target">Leia agora.</span></span>
        <span id="s4-sub">Notícia, agenda e serviço no mesmo lugar. Sem cadastro.</span>
        <div id="s4-url"><span id="s4-url-dot"></span><span>citynewscuiaba.vercel.app</span></div>
        <div id="s4-qr-plate"></div>
        <div id="s4-qr">{{QR}}</div>
        <span id="s4-qr-label">Aponte a câmera para abrir.</span>
      </div>

      <!-- Narração + ticks das palavras (gerados pelo build a partir da transcrição) -->
{{VO_AUDIO}}
      <!-- Trilha (MusicGen, local) com ducking sob a narração -->
      <audio id="bgm" src="assets/music/bed.wav" data-start="0" data-duration="30" data-track-index="6" data-volume="0.55"
        data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.5,"v":1},{"t":1.6,"v":1},{"t":1.8,"v":0.45},{"t":6.4,"v":0.45},{"t":6.8,"v":0.95},{"t":8.2,"v":0.95},{"t":8.4,"v":0.45},{"t":25.7,"v":0.45},{"t":26.1,"v":0.85},{"t":28.6,"v":0.85},{"t":30,"v":0}]}]}'></audio>

      <!-- Efeitos sonoros (sintetizados) -->
      <audio id="sfx-pop1" src="assets/sfx/pop.wav" data-start="0.62" data-duration="0.16" data-track-index="7" data-volume="0.8"></audio>
      <audio id="sfx-whoosh1" src="assets/sfx/whoosh.wav" data-start="1.7" data-duration="0.5" data-track-index="7" data-volume="0.5"></audio>
      <audio id="sfx-riser" src="assets/sfx/riser.wav" data-start="6.7" data-duration="0.9" data-track-index="7" data-volume="0.7"></audio>
      <audio id="sfx-pop2" src="assets/sfx/pop.wav" data-start="7.95" data-duration="0.16" data-track-index="7" data-volume="0.9"></audio>
      <audio id="sfx-whoosh2" src="assets/sfx/whoosh.wav" data-start="8.35" data-duration="0.5" data-track-index="7" data-volume="0.6"></audio>
      <audio id="sfx-whoosh3" src="assets/sfx/whoosh.wav" data-start="12.6" data-duration="0.5" data-track-index="7" data-volume="0.6"></audio>
      <audio id="sfx-whoosh4" src="assets/sfx/whoosh.wav" data-start="17.6" data-duration="0.5" data-track-index="7" data-volume="0.6"></audio>
      <audio id="sfx-whoosh5" src="assets/sfx/whoosh.wav" data-start="22.55" data-duration="0.5" data-track-index="7" data-volume="0.6"></audio>
      <audio id="sfx-pop3" src="assets/sfx/pop.wav" data-start="24.3" data-duration="0.16" data-track-index="7" data-volume="0.8"></audio>
    </div>

    <script>
      // shimmer-sweep: injeta a máscara em cada alvo (snippet do registro HyperFrames)
      document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
        if (!el.querySelector(".shimmer-mask")) {
          const mask = document.createElement("div");
          mask.className = "shimmer-mask";
          el.appendChild(mask);
        }
      });

      // Narração transcrita (Whisper): tempos de cada palavra, por fala. Injetado pelo build.
      const VO = {{VO_JSON}};
      // Legendas karaokê para as falas dos recursos: blocos de até 4 palavras, quebrando na pontuação
      function chunk(line, max) {
        const out = []; let cur = [];
        line.words.forEach((w, i) => {
          cur.push(w);
          const punct = /[,.!?:;]$/.test(w.w);
          if (cur.length >= max || punct || i === line.words.length - 1) { out.push(cur); cur = []; }
        });
        return out;
      }
      const CAPS = ["vo3", "vo4", "vo5"].map((k) => ({ base: VO[k].start, chunks: chunk(VO[k], 4).map((c) => c.map((w) => [w.w, w.s, w.e])) }));
      const capsHost = document.getElementById("s3-caps");
      const capPlan = []; // [{el, words:[{el,start}], t0, t1}] em tempo global
      CAPS.forEach((line, li) => {
        line.chunks.forEach((chunk, ci) => {
          const cap = document.createElement("div");
          cap.className = "cap"; cap.id = `cap-${li}-${ci}`;
          const pill = document.createElement("div"); pill.className = "cap-pill";
          const words = chunk.map(([w, s, e]) => {
            const span = document.createElement("span"); span.className = "cap-w"; span.textContent = w;
            pill.appendChild(span);
            return { el: span, start: line.base + s };
          });
          cap.appendChild(pill); capsHost.appendChild(cap);
          capPlan.push({ el: cap, words, t0: line.base + chunk[0][1], t1: line.base + chunk[chunk.length - 1][2] });
        });
      });

      const tl = gsap.timeline({ paused: true });

      // ---------- 1 · O ponto da cidade (0–3.4s) ----------
      gsap.set("#s1-logo .ponto", { opacity: 0 }); // o ponto que chega do mapa faz esse papel
      tl.fromTo("#s1-map .st, #s1-map .mt", { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: "power2.out", stagger: { each: 0.004, from: "center" } }, 0.05);
      tl.fromTo("#s1-map .mt", { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.4, ease: "power1.out" }, 0.45);
      tl.fromTo("#s1-dot", { opacity: 0, y: -260, scale: 1.4 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "bounce.out" }, 0.3);
      tl.fromTo("#s1-ripple", { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 7, duration: 0.8, ease: "power2.out" }, 0.62);
      tl.fromTo("#s1-ripple2", { opacity: 0.6, scale: 1 }, { opacity: 0, scale: 5, duration: 0.8, ease: "power2.out" }, 0.8);
      tl.fromTo("#s1-label", { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, 0.75);
      tl.fromTo("#s1-map", { scale: 1, transformOrigin: "430px 507px" }, { scale: 2.8, duration: 1.1, ease: "power2.inOut" }, 0.9);
      tl.to(["#s1-map", "#s1-label"], { opacity: 0, duration: 0.35, ease: "power1.in" }, 1.55);
      // o ponto voa de Cuiabá até o lugar do ponto no logotipo
      tl.to("#s1-dot", { x: 136.6, y: -115.8, scale: 0.85, duration: 0.55, ease: "power3.inOut" }, 1.7);
      tl.fromTo("#s1-logo .arc", { strokeDasharray: 160, strokeDashoffset: 160 }, { strokeDashoffset: 0, duration: 0.6, ease: "power3.out" }, 1.85);
      tl.fromTo("#s1-logo .wm-1", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: "expo.out" }, 2.0);
      tl.fromTo("#s1-logo .wm-2", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, 2.15);
      tl.fromTo("#s1-tag", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, 2.45);
      tl.to("#s1-stage", { scale: 1.04, duration: 1.0, ease: "none", transformOrigin: "50% 50%" }, 2.3);
      tl.to("#s1-stage", { opacity: 0, y: -40, duration: 0.22, ease: "power2.in" }, 3.17);

      // ---------- 2 · Título cinético (3.4–8s) ----------
      // Uma palavra por vez, no instante em que é dita (vo2)
      const t2 = VO.vo2.words;
      const words = t2.slice(0, 7).map((w, i) => {
        const next = t2[i + 1];
        return [`#w${i + 1}`, VO.vo2.start + w.s, (next ? next.s : w.s + 2.0) - w.s];
      });
      tl.fromTo("#s2-kicker", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 3.45);
      tl.fromTo("#s2-bar-fill", { scaleX: 0 }, { scaleX: 1, duration: 4.0, ease: "none" }, 3.5);
      words.forEach(([sel, t, d], i) => {
        const inDur = Math.min(0.28, d * 0.7);
        tl.fromTo(sel, { opacity: 0, yPercent: 60, scale: 0.86 }, { opacity: 1, yPercent: 0, scale: 1, duration: inDur, ease: "expo.out" }, t);
        if (i < words.length - 1) {
          tl.to(sel, { opacity: 0, yPercent: -55, scale: 1.04, duration: 0.12, ease: "power2.in" }, t + d - 0.1);
        }
      });
      tl.fromTo("#w3 .shimmer-sweep-target", { "--shimmer-pos": "-20%" }, { "--shimmer-pos": "120%", duration: 0.5, ease: "power2.inOut" }, words[2][1] + 0.05);
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
      const PHONE = 0.9; // escala do celular, abre espaço para as legendas
      function phoneIn(id, t, fromX) {
        tl.fromTo(id,
          { x: fromX, y: fromX === 0 ? 320 : 0, rotationY: fromX === 0 ? 0 : 28, rotationZ: fromX === 0 ? 0 : 4, opacity: fromX === 0 ? 0 : 1, scale: PHONE, transformPerspective: 1600, transformOrigin: "50% 0%" },
          { x: 0, y: 0, rotationY: 0, rotationZ: 0, opacity: 1, scale: PHONE, duration: 0.65, ease: "expo.out" }, t);
        tl.to(id, { rotationY: -6, duration: 2.6, ease: "sine.inOut" }, t + 0.7);
        tl.to(id, { rotationY: 0, duration: 0.85, ease: "sine.inOut" }, t + 3.3);
      }
      function phoneOut(id, t) {
        tl.to(id, { x: -1100, rotationZ: -6, rotationY: -20, duration: 0.5, ease: "power3.in" }, t);
      }
      function ring(id, t) {
        tl.fromTo(id, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t);
      }

      gsap.set(["#p2", "#p3"], { x: 1100, scale: PHONE, transformOrigin: "50% 0%" });
      gsap.set(["#c2 .eyebrow", "#c2 .title", "#c2 .sub", "#c3 .eyebrow", "#c3 .title", "#c3 .sub"], { opacity: 0 });

      // Recurso 1 · Perguntar (8–13s)
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

      // Legendas karaokê
      capPlan.forEach((c) => {
        tl.fromTo(c.el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, c.t0 - 0.06);
        c.words.forEach((w) => {
          tl.fromTo(w.el, { color: "#7d8591", scale: 1 }, { color: "#0f1b2d", scale: 1.06, duration: 0.12, ease: "power2.out", transformOrigin: "50% 60%" }, w.start);
        });
        tl.to(c.el, { opacity: 0, y: -16, duration: 0.18, ease: "power2.in" }, c.t1 + 0.22);
      });

      // ---------- 4 · CTA (23–30s) ----------
      tl.fromTo("#s4-art", { opacity: 0, scale: 1.08, transformOrigin: "50% 60%" }, { opacity: 1, scale: 1.0, duration: 6.8, ease: "none" }, 23.0);
      tl.fromTo("#s4-logo", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 23.1);
      tl.fromTo("#s4-cta", { opacity: 0, yPercent: 50, scale: 0.9 }, { opacity: 1, yPercent: 0, scale: 1, duration: 0.45, ease: "expo.out" }, 23.4);
      tl.fromTo("#s4-cta .shimmer-sweep-target", { "--shimmer-pos": "-20%" }, { "--shimmer-pos": "120%", duration: 0.9, ease: "power2.inOut" }, 24.6);
      tl.fromTo("#s4-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, 23.75);
      tl.fromTo("#s4-url", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 24.3);
      tl.fromTo("#s4-url-dot", { scale: 1 }, { scale: 1.5, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 5 }, 25.0);
      tl.fromTo("#s4-qr-plate", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 25.0);
      tl.fromTo("#s4-qr", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 25.0);
      tl.fromTo("#s4-qr-label", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, 25.4);
      tl.to("#s4-cta", { scale: 1.03, duration: 4.5, ease: "none" }, 25.0);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
