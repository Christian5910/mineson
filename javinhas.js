// javinhas.js — MinesON!
// Campo minado com a estética ON!. Menu, modais, configurações, sons e confirmação
// vêm de on.js (window.ON); aqui fica só o jogo.
// Seções: 1 Configuração · 2 Estado · 3 Regras · 4 Dica · 5 Desenho · 6 Novo jogo e salvar
//         7 Relógio · 8 Efeitos (som, explosão) · 9 Entrada · 10 Estatísticas · 11 Início

(() => {
  'use strict';

  /* ==========================================================================
     1. Configuração
     ========================================================================== */
  const NIVEIS = {
    easy:   { nome: 'Iniciante',     cols: 9,  rows: 9,  minas: 10 },
    medium: { nome: 'Intermediário', cols: 16, rows: 16, minas: 40 },
    hard:   { nome: 'Especialista',  cols: 30, rows: 16, minas: 99 },
  };

  const CELULA_MIN = 18;        // menor casa aceitável (px) antes de rolar a tela
  const CELULA_MAX = 48;        // maior casa (px)
  const CELULA_HARD_MIN = 22;   // abaixo disso o Especialista gira para 16×30
  const TOQUE_LONGO_MS = 420;   // segurar o dedo = ação secundária
  const EXPLOSAO_GIF = { w: 284, h: 400, cx: 138, cy: 220, ms: 1700 }; // 17 quadros × 100 ms, sem repetição

  const LS = {
    jogo: 'minesON.jogo',
    nivel: 'minesON.nivel',
    modo: 'minesON.modo',
    stats: 'minesON.stats',
    visto: 'minesON.visto',
  };

  const $ = (s) => document.querySelector(s);
  const el = {
    area: $('#game-area'),
    stage: $('#board-stage'),
    board: $('#board'),
    fx: $('#fx'),
    minas: $('#mines-left'),
    tempo: $('#timer'),
    msg: $('#message-area'),
    melhor: $('#best-line'),
    ajudaModo: $('#mode-help'),
    dica: $('#hint-btn'),
    niveis: document.querySelectorAll('#difficulty .seg-btn'),
    modos: document.querySelectorAll('#mode .seg-btn'),
    grupoModo: $('#mode'),
  };

  const pad = (n, t) => String(n).padStart(t, '0');
  const reduzido = () => ON.cfg.reduzir;


  /* ==========================================================================
     2. Estado
     ========================================================================== */
  // st: 0 fechada · 1 aberta · 2 bandeira
  // status: 'pronto' (antes da 1ª jogada) · 'jogando' · 'vitoria' · 'derrota'
  // modo: 'normal' (abrir = toque, bandeira = segurar) · 'bandeira' (invertido)
  let J = null;
  let celulas = [];
  let foco = 0;
  let modoEscolhido = ON.store.get(LS.modo, 'normal') === 'bandeira' ? 'bandeira' : 'normal';
  let msgTimer = 0;


  /* ==========================================================================
     3. Regras
     ========================================================================== */
  function vizinhos(i) {
    const { cols, rows } = J;
    const r = Math.floor(i / cols);
    const c = i % cols;
    const lista = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) lista.push(nr * cols + nc);
      }
    }
    return lista;
  }

  function calcularAdjacentes() {
    for (let i = 0; i < J.mina.length; i++) {
      let s = 0;
      for (const v of vizinhos(i)) s += J.mina[v];
      J.adj[i] = s;
    }
  }

  // A primeira jogada e as casas ao redor nunca têm mina.
  function colocarMinas(primeira) {
    const proibidas = new Set([primeira, ...vizinhos(primeira)]);
    const candidatas = [];
    for (let i = 0; i < J.mina.length; i++) if (!proibidas.has(i)) candidatas.push(i);
    for (let k = 0; k < J.minas; k++) {
      const r = k + Math.floor(Math.random() * (candidatas.length - k));
      [candidatas[k], candidatas[r]] = [candidatas[r], candidatas[k]];
      J.mina[candidatas[k]] = 1;
    }
    calcularAdjacentes();
    J.colocadas = true;
  }

  // Abre a casa e, se for zero, a região ao redor. Devolve [[casa, distância], ...]
  function inundar(inicio) {
    const aberta = [];
    const fila = [[inicio, 0]];
    for (let h = 0; h < fila.length; h++) {
      const [c, d] = fila[h];
      if (J.st[c] !== 0 || J.mina[c]) continue;
      J.st[c] = 1;
      J.abertas++;
      aberta.push([c, d]);
      if (J.adj[c] === 0) {
        for (const v of vizinhos(c)) if (J.st[v] === 0 && !J.mina[v]) fila.push([v, d + 1]);
      }
    }
    return aberta;
  }

  function terminou() { return J.status === 'vitoria' || J.status === 'derrota'; }

  function acao(i, tipo) {
    if (!J || terminou()) return;
    el.board.classList.remove('fresh');
    limparDica();
    const s = J.st[i];
    if (tipo === 'bandeira') {
      if (s === 1) return acorde(i);      // bandeira em número = abrir em volta
      return alternarBandeira(i);
    }
    if (s === 2) return;
    if (s === 1) return acorde(i);
    return abrirCasa(i);
  }

  function abrirCasa(i) {
    if (!J.colocadas) colocarMinas(i);
    if (J.status === 'pronto') comecarPartida();
    if (J.mina[i]) return perder([i]);
    pintarLista(inundar(i));
    depoisDaJogada();
  }

  function comecarPartida() {
    J.status = 'jogando';
    iniciarRelogio();
    mostrar('');
    atualizarControles();
  }

  function alternarBandeira(i) {
    const s = J.st[i];
    if (s === 0) { J.st[i] = 2; J.bandeiras++; } else { J.st[i] = 0; J.bandeiras--; }
    pintar(i);
    atualizarContadores();
    ON.som('toque');
    salvar();
  }

  // "Acorde": número com as bandeiras certas ao redor abre as vizinhas restantes.
  function acorde(i) {
    const n = J.adj[i];
    if (!n) return;
    const vs = vizinhos(i);
    let bandeiras = 0;
    for (const v of vs) if (J.st[v] === 2) bandeiras++;
    if (bandeiras !== n) return;
    const alvos = vs.filter((v) => J.st[v] === 0);
    if (!alvos.length) return;
    const atingidas = alvos.filter((v) => J.mina[v]);
    if (atingidas.length) return perder(atingidas);
    alvos.forEach((a) => pintarLista(inundar(a)));
    depoisDaJogada();
  }

  function depoisDaJogada() {
    if (J.abertas === J.cols * J.rows - J.minas) vencer();
    else salvar();
  }

  function perder(atingidas) {
    J.status = 'derrota';
    pararRelogio();
    ON.store.del(LS.jogo);
    let k = 0;
    J.mina.forEach((m, i) => {
      const c = celulas[i];
      if (atingidas.includes(i)) {
        c.classList.add('boom', 'mine');
      } else if (m && J.st[i] !== 2) {
        c.style.setProperty('--d', Math.min(150 + k * 35, 1400) + 'ms');
        c.classList.add('mine');
        k++;
      } else if (!m && J.st[i] === 2) {
        c.style.setProperty('--d', Math.min(150 + k * 35, 1400) + 'ms');
        c.classList.remove('flag');
        c.classList.add('wrong');
        k++;
      }
    });
    efeitoExplosao(celulas[atingidas[0]]);
    tocarExplosao();
    ON.impacto(el.stage, 'explosao'); // vibra o aparelho e treme o tabuleiro (cada um com a sua opção)
    registrarFim(false);
    atualizarControles();
    setTimeout(() => mostrar('Você abriu uma mina.', 'defeat'), 650);
  }

  function vencer() {
    J.status = 'vitoria';
    pararRelogio();
    ON.store.del(LS.jogo);
    J.mina.forEach((m, i) => {
      if (m && J.st[i] !== 2) {
        J.st[i] = 2;
        J.bandeiras++;
        pintar(i);
      }
    });
    atualizarContadores();
    celulas.forEach((c, i) => {
      c.style.setProperty('--d', Math.min((Math.floor(i / J.cols) + (i % J.cols)) * 30, 1200) + 'ms');
      c.classList.add('wave');
    });
    ON.vibrar('vitoria');
    ON.som('vitoria');

    const seg = Math.max(1, Math.round(J.ms / 1000));
    const recorde = registrarFim(true, seg);
    let texto = `Campo limpo em ${formatarTempo(seg)}.`;
    if (J.dicas) texto += ' Com dica, esta partida não vale recorde.';
    else if (recorde) texto += ' Novo recorde!';
    mostrar(texto, 'victory');
    atualizarRecorde();
    atualizarControles();
  }


  /* ==========================================================================
     4. Dica (só usa o que o jogador já vê na tela)
     ========================================================================== */
  const nomeCasa = (i) => `linha ${Math.floor(i / J.cols) + 1}, coluna ${(i % J.cols) + 1}`;

  function calcularDica() {
    let minaCerta = null;
    for (let i = 0; i < J.st.length; i++) {
      if (J.st[i] !== 1 || !J.adj[i]) continue;
      const n = J.adj[i];
      let bandeiras = 0;
      const fechadas = [];
      for (const v of vizinhos(i)) {
        if (J.st[v] === 2) bandeiras++;
        else if (J.st[v] === 0) fechadas.push(v);
      }
      if (!fechadas.length) continue;
      if (bandeiras === n) {
        // número satisfeito: o resto é seguro (se alguma bandeira estiver errada, avisa)
        const alvo = fechadas.find((v) => !J.mina[v]);
        if (fechadas.some((v) => J.mina[v])) {
          return { tipo: 'errada', fonte: i, texto: `Cuidado: alguma bandeira perto do ${n} da ${nomeCasa(i)} está no lugar errado. Confira as bandeiras ao redor dele.` };
        }
        return {
          tipo: 'segura', fonte: i, alvo,
          texto: `O ${n} da ${nomeCasa(i)} já tem ${n} ${n > 1 ? 'bandeiras' : 'bandeira'} ao redor. Então as outras casas fechadas dele são seguras. Abra a casa destacada.`,
        };
      }
      if (!minaCerta && n - bandeiras === fechadas.length) {
        const falta = n - bandeiras;
        minaCerta = {
          tipo: 'mina', fonte: i, alvo: fechadas[0],
          texto: `O ${n} da ${nomeCasa(i)} ainda precisa de ${falta} ${falta > 1 ? 'minas' : 'mina'} e só tem ${fechadas.length} ${fechadas.length > 1 ? 'casas fechadas' : 'casa fechada'} ao redor. Então ${fechadas.length > 1 ? 'todas são minas' : 'ela é mina'}. Marque a casa destacada com 🚩.`,
        };
      }
    }
    return minaCerta || {
      tipo: 'nenhuma',
      texto: 'Não achei uma jogada 100% certa só com os números que estão na tela. Olhe dois números vizinhos juntos, ou abra uma casa longe dos números altos.',
    };
  }

  function mostrarDica() {
    if (!J || terminou()) return;
    limparDica();
    if (J.status === 'pronto') {
      return mostrar('Faça a primeira jogada: ela é sempre segura. Depois peça a dica.', 'hint');
    }
    const d = calcularDica();
    J.dicas++;
    if (d.fonte !== undefined) celulas[d.fonte].classList.add('dica-fonte');
    if (d.alvo !== undefined) {
      celulas[d.alvo].classList.add('dica-alvo');
      celulas[d.alvo].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduzido() ? 'auto' : 'smooth' });
    }
    mostrar(d.texto, 'hint');
    ON.som('acerto');
  }

  function limparDica() {
    const marcadas = el.board.querySelectorAll('.dica-alvo, .dica-fonte');
    marcadas.forEach((c) => c.classList.remove('dica-alvo', 'dica-fonte'));
    if (el.msg.classList.contains('hint')) mostrar('');
  }


  /* ==========================================================================
     5. Desenho
     ========================================================================== */
  function larguraUtil() {
    const cs = getComputedStyle(el.area);
    return el.area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  // Tamanho de casa que cabe na largura (sem aplicar limites)
  function casaQueCabe(cols) {
    const cs = getComputedStyle(el.board);
    const pd = parseFloat(cs.paddingLeft) || 0;
    const gap = parseFloat(cs.columnGap) || 0;
    const miolo = larguraUtil() - 2 * pd - 4 - gap * (cols - 1);
    return Math.floor(miolo / cols);
  }

  function ajustarTamanho() {
    if (!J) return;
    let tam = Math.min(CELULA_MAX, casaQueCabe(J.cols));
    if (window.innerWidth >= 768) {
      // no desktop também cuida da altura da janela (sobra espaço pro botão e a mensagem)
      const pd = parseFloat(getComputedStyle(el.board).paddingTop) || 0;
      const topo = el.stage.getBoundingClientRect().top + window.scrollY;
      const porAltura = Math.floor((window.innerHeight - topo - 130 - 2 * pd - 4) / J.rows);
      tam = Math.min(tam, Math.max(24, porAltura));
    }
    tam = Math.max(CELULA_MIN, tam);
    el.board.style.setProperty('--cell-size', tam + 'px');
    el.board.style.setProperty('--cols', J.cols);
  }

  function montarTabuleiro() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < J.cols * J.rows; i++) {
      const r = Math.floor(i / J.cols);
      const c = i % J.cols;
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      d.style.cssText = `--r:${r};--c:${c}`;
      d.setAttribute('role', 'gridcell');
      d.setAttribute('aria-label', `Linha ${r + 1}, coluna ${c + 1}, fechada`);
      frag.appendChild(d);
    }
    el.board.textContent = '';
    el.board.appendChild(frag);
    el.board.classList.add('fresh');
    celulas = Array.from(el.board.children);
    J.vis = new Uint8Array(celulas.length); // o que cada casa mostra agora (evita repintar à toa)
    el.board.setAttribute('aria-rowcount', J.rows);
    el.board.setAttribute('aria-colcount', J.cols);
  }

  // código visual: 0 fechada · 2 bandeira · 10+n aberta com n minas ao redor
  const CLASSES = (cod) => (cod === 2 ? ['flag'] : cod >= 10 ? (cod > 10 ? ['open', 'n' + (cod - 10)] : ['open']) : []);

  function pintar(i) {
    const s = J.st[i];
    const cod = s === 1 ? 10 + J.adj[i] : s;
    const antes = J.vis[i];
    if (antes === cod) return;
    J.vis[i] = cod;
    const c = celulas[i];
    const rem = CLASSES(antes);
    if (rem.length) c.classList.remove(...rem);
    const add = CLASSES(cod);
    if (add.length) c.classList.add(...add);
    const n = J.adj[i];
    c.textContent = s === 1 && n ? n : '';
    const pos = `Linha ${Math.floor(i / J.cols) + 1}, coluna ${(i % J.cols) + 1}`;
    c.setAttribute('aria-label', `${pos}, ${s === 1 ? (n ? n + ' minas ao redor' : 'vazia') : s === 2 ? 'bandeira' : 'fechada'}`);
  }

  // Casas abertas em cascata aparecem em "ondas" (atraso proporcional à distância)
  function pintarLista(lista) {
    lista.forEach(([i, d]) => {
      celulas[i].style.setProperty('--d', Math.min(d * 40, 700) + 'ms');
      pintar(i);
    });
  }

  function pintarTudo() {
    for (let i = 0; i < celulas.length; i++) pintar(i);
  }

  function atualizarContadores() {
    const resta = J.minas - J.bandeiras;
    el.minas.textContent = resta < 0 ? '-' + pad(Math.min(99, -resta), 2) : pad(Math.min(999, resta), 3);
  }

  let tempoMostrado = -1;
  function mostrarTempo() {
    const s = Math.min(999, Math.floor(J.ms / 1000));
    if (s === tempoMostrado) return;
    tempoMostrado = s;
    el.tempo.textContent = pad(s, 3);
  }

  function formatarTempo(seg) {
    return `${pad(Math.floor(seg / 60), 2)}:${pad(seg % 60, 2)}`;
  }

  function atualizarRecorde() {
    const m = lerStats()[J.nivel].m;
    el.melhor.innerHTML = `Recorde<br><b>${m ? formatarTempo(m) : '-'}</b>`;
  }

  function mostrar(texto, tipo = '') {
    clearTimeout(msgTimer);
    el.msg.textContent = texto;
    el.msg.className = tipo;
  }

  function marcarNivel(nivel) {
    el.niveis.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === nivel)));
  }

  function marcarFoco() {
    celulas.forEach((c) => c.classList.remove('kbd'));
    if (celulas[foco]) celulas[foco].classList.add('kbd');
  }

  /* Modo (normal / bandeira): só muda antes da primeira jogada */
  function textoModo(modo) {
    const toque = matchMedia('(pointer: coarse)').matches;
    if (modo === 'bandeira') {
      return toque ? 'Toque marca 🚩 · segure o dedo para abrir' : 'Clique marca 🚩 · botão direito abre';
    }
    return toque ? 'Toque abre a casa · segure o dedo para marcar 🚩' : 'Clique abre a casa · botão direito marca 🚩';
  }

  function atualizarControles() {
    if (!J) return;
    const travado = J.status !== 'pronto';
    el.modos.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === J.modo));
      b.disabled = travado;
    });
    el.grupoModo.classList.toggle('travado', travado);
    el.ajustaModoTexto = null;
    const nome = J.modo === 'bandeira' ? 'Modo bandeira' : 'Modo Normal';
    el.ajudaModo.textContent = travado
      ? `🔒 ${nome} nesta partida. ${textoModo(J.modo)}`
      : `Escolha o modo antes de começar. ${textoModo(J.modo)}`;
    el.dica.disabled = J.status === 'vitoria' || J.status === 'derrota';
  }


  /* ==========================================================================
     6. Novo jogo, salvar e restaurar
     ========================================================================== */
  function novoJogo(nivel, snap) {
    const cfg = NIVEIS[nivel];
    let { cols, rows } = cfg;
    if (snap) {
      ({ cols, rows } = snap);
    } else if (nivel === 'hard' && casaQueCabe(cols) < CELULA_HARD_MIN) {
      [cols, rows] = [rows, cols]; // telas estreitas: 16 colunas × 30 linhas
    }
    const n = cols * rows;
    pararRelogio();
    tempoMostrado = -1;
    J = {
      nivel, cols, rows, minas: cfg.minas, modo: snap ? snap.modo : modoEscolhido,
      mina: new Uint8Array(n), adj: new Uint8Array(n), st: new Uint8Array(n), vis: null,
      status: 'pronto', colocadas: false, abertas: 0, bandeiras: 0, ms: 0, dicas: 0,
    };

    if (snap) {
      J.mina = Uint8Array.from(snap.mina.split(''), Number);
      J.st = Uint8Array.from(snap.st.split(''), Number);
      J.abertas = snap.abertas;
      J.bandeiras = snap.bandeiras;
      J.ms = snap.ms;
      J.dicas = snap.dicas || 0;
      J.colocadas = true;
      J.status = 'jogando';
      calcularAdjacentes();
    } else {
      ON.store.del(LS.jogo);
    }

    ON.store.set(LS.nivel, nivel);
    marcarNivel(nivel);
    montarTabuleiro();
    ajustarTamanho();
    if (snap) pintarTudo();
    foco = Math.floor(n / 2);
    atualizarContadores();
    mostrarTempo();
    atualizarRecorde();
    atualizarControles();
    mostrar(snap ? 'Partida retomada.' : 'Toque numa casa para começar. A primeira jogada é segura.');
    if (snap) iniciarRelogio();
  }

  function salvar() {
    if (!J || J.status !== 'jogando' || !J.colocadas) return;
    ON.store.set(LS.jogo, {
      v: 2,
      nivel: J.nivel, cols: J.cols, rows: J.rows, modo: J.modo, dicas: J.dicas,
      mina: Array.from(J.mina).join(''),
      st: Array.from(J.st).join(''),
      abertas: J.abertas, bandeiras: J.bandeiras, ms: Math.round(J.ms),
    });
  }

  function lerSalvo() {
    const s = ON.store.get(LS.jogo, null);
    try {
      const cfg = s && NIVEIS[s.nivel];
      if (!cfg || s.v !== 2) return null;
      const n = s.cols * s.rows;
      const mesmoFormato = (s.cols === cfg.cols && s.rows === cfg.rows) || (s.cols === cfg.rows && s.rows === cfg.cols);
      if (!mesmoFormato || s.mina.length !== n || s.st.length !== n) return null;
      if (s.modo !== 'normal' && s.modo !== 'bandeira') return null;
      return s;
    } catch { return null; }
  }

  // Botão "Novo jogo", troca de nível e tecla R: só perguntam se há partida em andamento.
  function pedirNovo(fazer, textos) {
    ON.novoJogo(J && J.status === 'jogando', () => {
      if (J.status === 'jogando') registrarFim(false); // desistir conta como derrota
      fazer();
    }, textos);
  }

  function novoPeloUsuario() {
    pedirNovo(() => novoJogo(J.nivel), {
      titulo: 'Começar um novo jogo?',
      texto: 'A partida em andamento será perdida e conta como derrota na sua sequência.',
      sim: 'Sim, novo jogo',
      nao: 'Continuar jogando',
    });
  }


  /* ==========================================================================
     7. Relógio (pausa quando a aba fica oculta)
     ========================================================================== */
  let relogioId = null;
  let ultimo = 0;
  let pausado = false;

  function iniciarRelogio() {
    ultimo = performance.now();
    clearInterval(relogioId);
    relogioId = setInterval(() => {
      const agora = performance.now();
      if (!pausado && J && J.status === 'jogando') J.ms += agora - ultimo;
      ultimo = agora;
      if (J) mostrarTempo();
    }, 250);
  }

  function pararRelogio() {
    clearInterval(relogioId);
    relogioId = null;
  }

  document.addEventListener('visibilitychange', () => {
    pausado = document.hidden;
    if (document.hidden) salvar(); else ultimo = performance.now();
  });
  window.addEventListener('pagehide', salvar);


  /* ==========================================================================
     8. Efeitos: som e explosão
     ========================================================================== */
  // Som via Web Audio: evita problemas de "Range" do Safari com service worker.
  let bufferExplosao = null;
  let gifBlob = null;

  function prepararAudio() {
    const ctx = ON.audio(); // criado/liberado dentro do primeiro gesto do usuário
    if (!ctx || bufferExplosao) return;
    fetch('assets/explosion.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { bufferExplosao = buf; })
      .catch(() => {});
  }

  function tocarExplosao() {
    if (!ON.cfg.som) return;
    const ctx = ON.audio();
    if (ctx && bufferExplosao) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = bufferExplosao;
      const ganho = ctx.createGain();
      ganho.gain.value = 1;                // volume máximo (o arquivo já está normalizado no limite)
      fonte.connect(ganho);
      ganho.connect(ctx.destination);
      fonte.start();
    } else {
      try { const a = new Audio('assets/explosion.mp3'); a.volume = 1; a.play().catch(() => {}); } catch { /* ignora */ }
    }
  }

  function precarregarGif() {
    fetch('assets/explosion.gif').then((r) => r.blob()).then((b) => { gifBlob = b; }).catch(() => {});
  }

  function efeitoExplosao(celula) {
    if (reduzido()) return; // "Reduzir animações": só o som e a casa vermelha

    // clarão
    const flash = document.createElement('div');
    flash.className = 'boom-flash';
    el.fx.appendChild(flash);
    setTimeout(() => flash.remove(), 700);

    // GIF: um blob novo a cada explosão começa sempre do quadro 0, e o arquivo
    // não tem repetição (toca uma única vez). A imagem é removida ao terminar.
    const sr = el.stage.getBoundingClientRect();
    const cr = celula.getBoundingClientRect();
    const k = Math.min(1.6, Math.max(0.8, sr.width / EXPLOSAO_GIF.w));
    const img = new Image();
    const url = gifBlob ? URL.createObjectURL(gifBlob) : 'assets/explosion.gif';
    img.className = 'boom-gif';
    img.alt = '';
    img.style.width = EXPLOSAO_GIF.w * k + 'px';
    img.style.height = EXPLOSAO_GIF.h * k + 'px';
    img.style.left = cr.left + cr.width / 2 - sr.left - EXPLOSAO_GIF.cx * k + 'px';
    img.style.top = cr.top + cr.height / 2 - sr.top - EXPLOSAO_GIF.cy * k + 'px';
    img.src = url;
    el.fx.appendChild(img);
    setTimeout(() => {
      img.remove();
      if (gifBlob) URL.revokeObjectURL(url);
    }, EXPLOSAO_GIF.ms + 60);
  }


  /* ==========================================================================
     9. Entrada (mouse, toque e teclado)
     ========================================================================== */
  const primaria = () => (J.modo === 'bandeira' ? 'bandeira' : 'abrir');
  const secundaria = () => (J.modo === 'bandeira' ? 'abrir' : 'bandeira');

  let toque = null;

  function limparPressionadas() {
    el.board.querySelectorAll('.pressed').forEach((c) => c.classList.remove('pressed'));
  }

  function cancelarToque() {
    if (toque) clearTimeout(toque.t);
    toque = null;
    limparPressionadas();
  }

  el.board.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cell');
    if (!c || !J || terminou()) return;
    const i = Number(c.dataset.i);
    foco = i;

    if (e.pointerType === 'mouse') {
      if (e.button === 2) { e.preventDefault(); acao(i, secundaria()); toque = { feito: true }; return; }
      if (e.button === 1) { e.preventDefault(); if (J.st[i] === 1) acorde(i); toque = { feito: true }; return; }
      if (e.button !== 0) return;
    }

    toque = { i, x: e.clientX, y: e.clientY, feito: false, t: null };
    if (J.st[i] === 0) c.classList.add('pressed');

    if (e.pointerType !== 'mouse') {
      toque.t = setTimeout(() => {
        if (!toque || toque.feito) return;
        toque.feito = true;
        ON.vibrar('toque');
        acao(toque.i, secundaria());
        limparPressionadas();
      }, TOQUE_LONGO_MS);
    }
  });

  el.board.addEventListener('pointermove', (e) => {
    if (toque && !toque.feito && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 10) cancelarToque();
  }, { passive: true });

  el.board.addEventListener('pointerup', (e) => {
    if (!toque) return;
    clearTimeout(toque.t);
    const c = e.target.closest('.cell');
    const valido = !toque.feito && c && Number(c.dataset.i) === toque.i;
    const i = toque.i;
    toque = null;
    limparPressionadas();
    if (valido) acao(i, primaria());
  });

  el.board.addEventListener('pointercancel', cancelarToque);
  el.board.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') cancelarToque(); });
  el.board.addEventListener('contextmenu', (e) => e.preventDefault());

  // Os dois botões do mouse juntos = acorde
  el.board.addEventListener('mousedown', (e) => {
    if (e.buttons !== 3 || !J) return;
    const c = e.target.closest('.cell');
    if (!c) return;
    e.preventDefault();
    const i = Number(c.dataset.i);
    if (J.st[i] === 1) acorde(i);
    if (toque) toque.feito = true;
    limparPressionadas();
  });

  // Teclado no tabuleiro
  el.board.addEventListener('focus', marcarFoco);
  el.board.addEventListener('keydown', (e) => {
    if (!J) return;
    const { cols, rows } = J;
    const r = Math.floor(foco / cols);
    const c = foco % cols;
    const mapa = {
      ArrowLeft: c > 0 ? foco - 1 : foco,
      ArrowRight: c < cols - 1 ? foco + 1 : foco,
      ArrowUp: r > 0 ? foco - cols : foco,
      ArrowDown: r < rows - 1 ? foco + cols : foco,
    };
    if (e.key in mapa) {
      e.preventDefault();
      foco = mapa[e.key];
      marcarFoco();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      acao(foco, primaria());
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      acao(foco, 'bandeira');
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && !ON.modal.aberto() && J) {
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select')) return;
      novoPeloUsuario();
    }
  });

  // Botões
  $('#restart-btn').addEventListener('click', novoPeloUsuario);
  el.dica.addEventListener('click', mostrarDica);

  el.niveis.forEach((b) => b.addEventListener('click', () => {
    const nivel = b.dataset.level;
    if (nivel === J.nivel) return;
    pedirNovo(() => novoJogo(nivel), {
      titulo: 'Mudar a dificuldade?',
      texto: 'A partida em andamento será perdida e conta como derrota na sua sequência.',
      sim: 'Sim, mudar',
      nao: 'Continuar jogando',
    });
  }));

  // O modo só muda antes da primeira jogada (depois os botões ficam travados)
  el.modos.forEach((b) => b.addEventListener('click', () => {
    if (!J || J.status !== 'pronto') return;
    J.modo = modoEscolhido = b.dataset.mode;
    ON.store.set(LS.modo, J.modo);
    atualizarControles();
  }));

  // O navegador só libera áudio depois de um gesto do usuário
  document.addEventListener('pointerdown', prepararAudio, { once: true });
  document.addEventListener('keydown', prepararAudio, { once: true });

  let rz = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(ajustarTamanho);
  });


  /* ==========================================================================
     10. Estatísticas
     ========================================================================== */
  function statsPadrao() {
    const s = { seq: 0, melhor: 0 };
    for (const n in NIVEIS) s[n] = { j: 0, v: 0, m: 0 };
    return s;
  }

  function lerStats() {
    const s = ON.store.get(LS.stats, null);
    const base = statsPadrao();
    if (!s) return base;
    for (const n in NIVEIS) if (s[n]) Object.assign(base[n], s[n]);
    base.seq = s.seq || 0;
    base.melhor = s.melhor || 0;
    return base;
  }

  // Devolve true se bateu o recorde de tempo
  function registrarFim(venceu, seg) {
    const s = lerStats();
    const n = s[J.nivel];
    let recorde = false;
    n.j++;
    if (venceu) {
      n.v++;
      s.seq++;
      if (s.seq > s.melhor) s.melhor = s.seq;
      if (!J.dicas && (!n.m || seg < n.m)) { n.m = seg; recorde = true; }
    } else {
      s.seq = 0;
    }
    ON.store.set(LS.stats, s);
    return recorde;
  }

  function estatisticas() {
    const s = lerStats();
    const linhas = Object.keys(NIVEIS).map((k) => ({
      larga: true,
      rotulo: NIVEIS[k].nome,
      valor: `${s[k].v}/${s[k].j} vit. · ${s[k].m ? formatarTempo(s[k].m) : '-'}`,
    }));
    linhas.push({ rotulo: 'Sequência', valor: s.seq }, { rotulo: 'Melhor sequência', valor: s.melhor });
    return linhas;
  }


  /* ==========================================================================
     11. Início
     ========================================================================== */
  function iniciar() {
    precarregarGif();
    const salvo = lerSalvo();
    if (salvo) {
      novoJogo(salvo.nivel, salvo);
    } else {
      const nivel = ON.store.get(LS.nivel, 'easy');
      novoJogo(NIVEIS[nivel] ? nivel : 'easy');
    }
    // 1ª visita: abre o "Como Jogar" (quem nunca jogou precisa dele)
    if (!ON.store.get(LS.visto, false)) {
      ON.store.set(LS.visto, true);
      setTimeout(() => { if (!ON.modal.aberto()) ON.modal.abrir('howto-modal'); }, 500);
    }
    window.addEventListener('load', ajustarTamanho);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarTamanho);
  }

  ON.init({
    id: 'mineson',
    nome: 'MinesON!',
    configuracoes: ['som', 'vibracao', 'tremor', 'escuro', 'reduzir'],
    estatisticas,
    zerarEstatisticas: () => { ON.store.del(LS.stats); if (J) atualizarRecorde(); },
    pronto: iniciar,
  });
})();
