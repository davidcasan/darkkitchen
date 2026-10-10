// IA Comp · Dark Kitchen Studio: monta a composição inicial de um pedido no After Effects.
// Vai dentro do kit do pedido, ao lado de pedido.jsxinc (dados) e da pasta assets/.
// Designer: File > Scripts > Run Script File... (monta no projeto aberto).
// Máquina operária: o scripts/maquina-operaria.mjs define DK_SAIDA_AEP / DK_SAIDA_PREVIA / DK_FIM
// antes de rodar; aí o script começa um projeto novo, salva o .aep e a prévia e avisa no DK_FIM.
// ExtendScript (ES3): sem let/const, sem JSON nativo, sem "?:" encadeado.

(function () {
  var pasta = new File($.fileName).parent;
  $.evalFile(new File(pasta.fsName + "/pedido.jsxinc")); // define PEDIDO
  var P = PEDIDO;
  var operaria = typeof DK_SAIDA_AEP !== "undefined";
  if (operaria) app.newProject();

  function hex(h) {
    if (!h || h.length < 7) return [0.05, 0.05, 0.05];
    return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255];
  }
  function luz(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function fonte(ps, alt) { try { if (app.fonts.getFontsByPostScriptName(ps).length) return ps; } catch (e) {} return alt; }
  var FONTE = fonte("Sora-ExtraBold", fonte("Montserrat-Black", "Arial-BoldMT"));
  var FONTE_TEXTO = fonte("Inter-Regular", "ArialMT");

  var TAM = { "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350], "16:9": [1920, 1080] };
  var FPS = 30, DUR = P.duracao || 10;

  app.beginUndoGroup("IA Comp " + P.codigo);
  var raiz = app.project.items.addFolder(P.codigo + " · " + P.titulo);
  var pComps = app.project.items.addFolder("Comps"); pComps.parentFolder = raiz;
  var pAssets = app.project.items.addFolder("Assets do cliente"); pAssets.parentFolder = raiz;

  // Assets do cliente.
  var logo = null, problemas = [];
  for (var i = 0; i < P.assets.length; i++) {
    var f = new File(pasta.fsName + "/" + P.assets[i].arquivo);
    if (!f.exists) continue;
    try {
      var io = new ImportOptions(f);
      if (io.canImportAs(ImportAsType.FOOTAGE)) io.importAs = ImportAsType.FOOTAGE;
      var it = app.project.importFile(io);
      it.parentFolder = pAssets;
      if (P.assets[i].categoria === "logo" && !logo && it.width) logo = it;
    } catch (e) { problemas.push(P.assets[i].arquivo + " (não importou: " + e.toString() + ")"); }
  }

  // Cores: a mais escura vira fundo; a de mais contraste com ela, o texto.
  var cores = [];
  for (var c = 0; c < P.cores.length; c++) cores.push(hex(P.cores[c]));
  if (!cores.length) cores = [hex("#0D0D0D"), hex("#F5EEE9")];
  var fundo = cores[0], texto = cores[0];
  for (var k = 0; k < cores.length; k++) if (luz(cores[k]) < luz(fundo)) fundo = cores[k];
  for (var k2 = 0; k2 < cores.length; k2++) if (Math.abs(luz(cores[k2]) - luz(fundo)) > Math.abs(luz(texto) - luz(fundo))) texto = cores[k2];
  if (Math.abs(luz(texto) - luz(fundo)) < 0.4) texto = luz(fundo) < 0.5 ? [0.96, 0.93, 0.91] : [0.05, 0.05, 0.05];

  // Comp de paleta (referência).
  var pal = app.project.items.addComp("Paleta", 1200, 300, 1, 5, FPS);
  pal.parentFolder = raiz;
  for (var pc = 0; pc < cores.length && pc < 8; pc++) {
    var sw = pal.layers.addSolid(cores[pc], P.cores[pc] || "cor", 140, 140, 1);
    sw.property("ADBE Transform Group").property("ADBE Position").setValue([90 + pc * 150, 120]);
    var tl = pal.layers.addText(P.cores[pc] || "");
    var tdp = tl.property("ADBE Text Properties").property("ADBE Text Document");
    var vp = tdp.value; vp.fontSize = 22; vp.fillColor = [0.8, 0.8, 0.8]; vp.font = FONTE_TEXTO; tdp.setValue(vp);
    tl.property("ADBE Transform Group").property("ADBE Position").setValue([40 + pc * 150, 230]);
  }

  // Texto do guia (briefing + sugestões), numa camada guia que não renderiza.
  var guia = "BRIEFING\r" + P.briefing.replace(/\n/g, "\r");
  if (P.sugestoes) {
    guia += "\r\rSUGESTÕES DA IA (ponto de partida)\rConceito: " + P.sugestoes.conceito;
    for (var lc = 0; lc < P.sugestoes.linhas_criativas.length; lc++)
      guia += "\r- " + P.sugestoes.linhas_criativas[lc].titulo + ": " + P.sugestoes.linhas_criativas[lc].descricao;
    guia += "\rTipografia: " + P.sugestoes.tipografia + "\rRitmo: " + P.sugestoes.ritmo + "\rTrilha: " + P.sugestoes.trilha + "\rObservações: " + P.sugestoes.observacoes;
  }
  if (problemas.length) guia += "\r\rArquivos que não importaram: " + problemas.join("; ");

  function textoNaComp(comp, str, tam, y, fonteUsada, cor) {
    var l = comp.layers.addText(str);
    var src = l.property("ADBE Text Properties").property("ADBE Text Document");
    var td = src.value;
    td.resetCharStyle(); td.resetParagraphStyle();
    td.font = fonteUsada; td.fontSize = tam; td.applyFill = true; td.fillColor = cor; td.applyStroke = false;
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    src.setValue(td);
    // Âncora no centro real do texto: frases de várias linhas ficam centralizadas na altura.
    var r = l.sourceRectAtTime(0, false);
    l.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
    l.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, y]);
    return l;
  }
  // Quebra o texto em linhas de até n caracteres (o ExtendScript não quebra sozinho em texto de ponto).
  function quebra(str, n) {
    var palavras = String(str).split(" "), linhas = [], atual = "";
    for (var w = 0; w < palavras.length; w++) {
      if ((atual + " " + palavras[w]).length > n && atual) { linhas.push(atual); atual = palavras[w]; }
      else atual = atual ? atual + " " + palavras[w] : palavras[w];
    }
    if (atual) linhas.push(atual);
    return linhas.join("\r");
  }

  var primeira = null;
  for (var fi = 0; fi < P.formatos.length; fi++) {
    var fmt = P.formatos[fi], dim = TAM[fmt] || [1920, 1080];
    var comp = app.project.items.addComp(P.codigo + " · " + fmt, dim[0], dim[1], 1, DUR, FPS);
    comp.parentFolder = pComps;
    if (!primeira) primeira = comp;
    comp.layers.addSolid(fundo, "Fundo", dim[0], dim[1], 1);
    var menor = Math.min(dim[0], dim[1]);
    var tam = Math.round(menor * 0.075), porLinha = Math.max(12, Math.round(dim[0] / (tam * 0.55)));

    for (var ci = 0; ci < P.cenas.length; ci++) {
      var cena = P.cenas[ci];
      var ini = Math.max(0, Math.min(cena.inicio, DUR)), fim = Math.max(ini + 0.1, Math.min(cena.fim, DUR));
      var m = new MarkerValue("Cena " + (ci + 1) + (cena.visual ? ": " + cena.visual : ""));
      m.duration = fim - ini;
      if (cena.locucao) m.comment = "Cena " + (ci + 1) + " · Locução: " + cena.locucao + (cena.visual ? " · Visual: " + cena.visual : "");
      comp.markerProperty.setValueAtTime(ini, m);
      if (cena.texto_tela) {
        var lt = textoNaComp(comp, quebra(cena.texto_tela, porLinha), tam, dim[1] / 2, FONTE, texto);
        lt.name = "Cena " + (ci + 1) + " · texto";
        lt.inPoint = ini; lt.outPoint = fim;
        var op = lt.property("ADBE Transform Group").property("ADBE Opacity");
        op.setValueAtTime(ini, 0); op.setValueAtTime(Math.min(fim, ini + 0.3), 100);
        if (fim - ini > 0.6) { op.setValueAtTime(fim - 0.3, 100); op.setValueAtTime(fim, 0); }
      }
    }

    if (logo) {
      var ll = comp.layers.add(logo);
      ll.name = "Logo do cliente";
      // 35% da largura; logo vetorial (SVG/AI/PDF) pode crescer sem perder qualidade, imagem até 100%.
      var vetor = /.(svg|ai|pdf|eps)$/i.test(logo.name);
      var esc = Math.min(vetor ? 400 : 100, (dim[0] * 0.35) / logo.width * 100);
      ll.property("ADBE Transform Group").property("ADBE Scale").setValue([esc, esc, 100]);
      ll.property("ADBE Transform Group").property("ADBE Position").setValue([dim[0] / 2, dim[1] * 0.82]);
      ll.inPoint = Math.max(0, DUR - 2);
    }

    var g = textoNaComp(comp, guia, Math.max(14, Math.round(menor * 0.016)), 60, FONTE_TEXTO, [1, 0.85, 0.3]);
    var tdg = g.property("ADBE Text Properties").property("ADBE Text Document"), vg = tdg.value;
    vg.justification = ParagraphJustification.LEFT_JUSTIFY; tdg.setValue(vg);
    var rg = g.sourceRectAtTime(0, false);
    g.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([rg.left, rg.top]);
    g.property("ADBE Transform Group").property("ADBE Position").setValue([40, 40]);
    g.name = "GUIA · briefing e sugestões (não renderiza)";
    g.guideLayer = true;
    g.enabled = false; // ligue o olho para ler; como camada guia, nunca sai no render
  }
  app.endUndoGroup();

  if (operaria) {
    if (primeira) {
      try { primeira.saveFrameToPng(Math.min(DUR / 2, DUR - 0.1), new File(DK_SAIDA_PREVIA)); } catch (e) {}
    }
    app.project.save(new File(DK_SAIDA_AEP));
    var fimArq = new File(DK_FIM); fimArq.open("w"); fimArq.writeln("ok"); fimArq.close();
  } else if (primeira) {
    primeira.openInViewer();
  }
})();
