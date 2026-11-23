const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { print: 'Imprimir', caveat: 'Ressalvas', buy: 'Comprar' };
const pref = (k, d) => { try { return localStorage.getItem('br.' + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('br.' + k, v); } catch { /* sem armazenamento */ } };
const view = { filter: 'all', text: '', mesa: pref('mesa', '256'), modo: pref('modo', 'placas') };
let current = null;

async function api(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
  return body;
}

async function status() {
  try {
    const s = await api('/api/status');
    const msgs = [];
    if (!s.db) msgs.push('Banco vazio. No terminal: <code>npm run import:rebrickable</code>.');
    if (!s.ldraw) msgs.push('Sem a biblioteca de formas nada vira STL e tudo aparece como "Comprar". No terminal: <code>npm run import:ldraw</code>.');
    $('#banner').hidden = !msgs.length;
    $('#banner').innerHTML = msgs.join('<br>');
  } catch { /* ignora */ }
}

function route() {
  const m = location.hash.replace(/^#\/?/, '').match(/^set\/(.+)$/);
  if (m) return showSet(decodeURIComponent(m[1]));
  const q = $('#q').value.trim();
  if (q) return doSearch(q);
  home();
}

function home() {
  current = null;
  app.innerHTML = `<section class="hero">
    <h1>Do conjunto à lista de peças para imprimir.</h1>
    <p>Busque um conjunto de LEGO® e veja o que dá para imprimir em 3D e o que é melhor comprar. Baixe os arquivos já organizados em placas de impressão.</p>
    <div class="chips" aria-label="Exemplos de busca">
      <button class="chip" data-q="10294">número do conjunto</button>
      <button class="chip" data-q="titanic">nome ou tema</button>
      <button class="chip" data-q="4121715">ID de elemento</button>
    </div></section>`;
  app.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { $('#q').value = b.dataset.q; $('#q').dispatchEvent(new Event('input')); }));
}

let timer;
const go = () => { if (location.hash !== '#/') location.hash = '#/'; else route(); };
$('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(go, 250); });
$('#f').addEventListener('submit', (e) => { e.preventDefault(); go(); });
addEventListener('hashchange', route);

const thumb = (url) => url
  ? `<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="${esc(url)}" alt="" onerror="this.outerHTML='<div class=&quot;thumb ph&quot;>sem foto</div>'">`
  : '<div class="thumb ph">sem foto</div>';

async function doSearch(q) {
  current = null;
  app.innerHTML = '<div class="skel"></div><div class="skel"></div>';
  try {
    const r = await api('/api/search?q=' + encodeURIComponent(q));
    let html = '';
    if (r.elements.length) {
      html += '<h2 class="sec">Elemento</h2><ul class="list">' + r.elements.map((e) => `
        <li><div class="row"><div>
          <b class="num">${esc(e.part_num)}</b> ${esc(e.part_name)} <span class="meta">· ${esc(e.color_name)} · elemento ${esc(e.element_id)}</span>
          <div><a href="/api/part/${encodeURIComponent(e.part_num)}.stl">Baixar STL</a></div>
          ${e.sets.length ? '<div class="meta">Aparece em: ' + e.sets.map((s) => `<a href="#/set/${esc(s.set_num)}">${esc(s.set_num)}</a> (${s.qty}×)`).join(', ') + '</div>' : ''}
        </div></div></li>`).join('') + '</ul>';
    }
    if (r.part) {
      html += `<h2 class="sec">Peça</h2><ul class="list"><li><div class="row"><div><b class="num">${esc(r.part.part_num)}</b> ${esc(r.part.name)}
        <span class="meta">· ${esc(r.part.category || '')}</span><div><a href="/api/part/${encodeURIComponent(r.part.part_num)}.stl">Baixar STL</a></div></div></div></li></ul>`;
    }
    if (r.sets.length) {
      html += '<h2 class="sec">Conjuntos</h2><ul class="list">' + r.sets.map((s) => `
        <li><a class="row" href="#/set/${esc(s.set_num)}">${thumb(s.img_url)}
          <div><b>${esc(s.name)}</b><div class="meta"><span class="num">${esc(s.set_num)}</span> · ${esc(s.year)} · ${esc(s.theme_name)} · ${s.num_parts} peças</div></div></a></li>`).join('') + '</ul>';
    }
    app.innerHTML = html || '<div class="empty">Nada encontrado. Tente o número do conjunto ou parte do nome.</div>';
  } catch (e) {
    app.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`;
  }
}

async function showSet(num) {
  app.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  try {
    const d = await api('/api/set/' + encodeURIComponent(num));
    Object.assign(view, { filter: 'all', text: '' });
    current = d;
    render(d);
    if (d.libraryAvailable && d.unchecked.length) await checkShapes(d, num);
  } catch (e) {
    app.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`;
  }
}

async function checkShapes(d, num) {
  const ids = d.unchecked;
  const box = $('#progress');
  if (box) box.innerHTML = `<div class="notice">Verificando as formas das peças… <progress max="${ids.length}" value="0"></progress></div>`;
  for (let i = 0; i < ids.length; i += 12) {
    if (current !== d) return;
    await api('/api/shapes/check?ids=' + ids.slice(i, i + 12).map(encodeURIComponent).join(','));
    const bar = $('#progress progress');
    if (bar) bar.value = Math.min(ids.length, i + 12);
  }
  const fresh = await api('/api/set/' + encodeURIComponent(num));
  if (current !== d) return;
  current = fresh;
  render(fresh);
}

function zipHref(d) {
  return `/api/set/${encodeURIComponent(d.set.set_num)}/zip?modo=${view.modo}&mesa=${view.mesa}`;
}

function render(d) {
  const s = d.summary;
  const tot = Math.max(1, s.print.pieces + s.caveat.pieces + s.buy.pieces);
  const enc = encodeURIComponent(d.set.set_num);
  const counts = { all: d.lines.length, print: s.print.lines, caveat: s.caveat.lines, buy: s.buy.lines };
  const tabs = [['all', 'Tudo'], ['print', 'Imprimir'], ['caveat', 'Ressalvas'], ['buy', 'Comprar']];
  const prevText = view.text;
  app.innerHTML = `
    <div class="setHead">
      ${thumb(d.set.img_url)}
      <div>
        <h1>${esc(d.set.name)}</h1>
        <div class="tags"><span class="tag num">${esc(d.set.set_num)}</span><span class="tag">${esc(d.set.year)}</span>
          <span class="tag">${esc(d.set.theme)}</span>
          <a class="tag" href="https://rebrickable.com/sets/${enc}/" rel="noopener">Rebrickable ↗</a></div>
      </div>
    </div>

    <div class="panel">
      <h3>Resumo por peças</h3>
      <div class="stack" role="img" aria-label="${s.print.pieces} para imprimir, ${s.caveat.pieces} com ressalvas, ${s.buy.pieces} para comprar">
        <i class="print" style="width:${s.print.pieces / tot * 100}%"></i><i class="caveat" style="width:${s.caveat.pieces / tot * 100}%"></i><i class="buy" style="width:${s.buy.pieces / tot * 100}%"></i>
      </div>
      <div class="legend">
        <div><span class="dot print"></span><b>${s.print.pieces}</b>imprimir <small>(${s.print.lines} tipos)</small></div>
        <div><span class="dot caveat"></span><b>${s.caveat.pieces}</b>com ressalvas <small>(${s.caveat.lines})</small></div>
        <div><span class="dot buy"></span><b>${s.buy.pieces}</b>comprar <small>(${s.buy.lines})</small></div>
      </div>
      <p class="help">Listadas ${d.listed} de ${d.set.num_parts} declaradas${d.listed < d.set.num_parts ? ' (o inventário do Rebrickable não traz peças de minifigura)' : ''}.${d.spares ? ` ${d.spares} ${d.spares === 1 ? 'sobressalente ignorada' : 'sobressalentes ignoradas'}.` : ''}</p>
    </div>
    ${d.libraryAvailable ? '' : '<div class="notice warn">Sem a biblioteca LDraw instalada, nada pode ser impresso: tudo aparece como "Comprar".</div>'}
    <div id="progress"></div>

    <div class="cols">
      <div class="panel">
        <h3>Arquivos para imprimir</h3>
        <div class="opts">
          <label>Agrupar em
            <select id="modo"><option value="placas">placas de impressão (recomendado)</option><option value="pecas">um arquivo por peça</option></select></label>
          <label>Mesa da impressora
            <select id="mesa">${[180, 220, 256, 350].map((m) => `<option value="${m}">${m} × ${m} mm</option>`).join('')}</select></label>
        </div>
        <div class="btns"><a id="zip" class="btn primary" href="${zipHref(d)}">Baixar STLs (.zip)</a></div>
        <p class="help">Em "placas", as peças de cada cor vêm juntas, na quantidade certa, prontas para uma mesa do tamanho escolhido. Imprima uma peça de teste antes.</p>
      </div>
      <div class="panel">
        <h3>Lista de compras</h3>
        <div class="btns">
          <a class="btn" href="/api/set/${enc}/export?kind=buy">CSV de compras</a>
          <a class="btn" href="/api/set/${enc}/export?kind=all">Lista completa</a>
          <a class="btn" href="/api/set/${enc}/export?kind=rebrickable" title="Formato Part,Color,Quantity">CSV Rebrickable</a>
        </div>
        <p class="help">Só o que está em "Comprar".</p>
      </div>
    </div>

    <div class="toolbar">
      <div class="tabs" role="group" aria-label="Filtrar">${tabs.map(([k, t]) => `<button data-f="${k}" aria-pressed="${view.filter === k}">${t}<small>${counts[k]}</small></button>`).join('')}</div>
      <input id="ft" type="search" placeholder="Filtrar por peça, nome ou cor" aria-label="Filtrar a lista" value="${esc(prevText)}">
    </div>
    <div class="tablewrap" id="tbl"></div>`;
  $('#modo').value = view.modo; $('#mesa').value = view.mesa;
  $('#modo').addEventListener('change', (e) => { view.modo = e.target.value; setPref('modo', view.modo); $('#zip').href = zipHref(d); });
  $('#mesa').addEventListener('change', (e) => { view.mesa = e.target.value; setPref('mesa', view.mesa); $('#zip').href = zipHref(d); });
  app.querySelectorAll('button[data-f]').forEach((b) => b.addEventListener('click', () => {
    view.filter = b.dataset.f;
    app.querySelectorAll('button[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    table(d);
  }));
  $('#ft').addEventListener('input', (e) => { view.text = e.target.value; table(d); });
  table(d);
}

function table(d) {
  const t = view.text.trim().toLowerCase();
  const lines = d.lines.filter((l) => (view.filter === 'all' || l.status === view.filter)
    && (!t || `${l.part_num} ${l.name} ${l.color_name}`.toLowerCase().includes(t)));
  if (!lines.length) { $('#tbl').innerHTML = '<div class="empty">Nenhuma peça neste filtro.</div>'; return; }
  const groups = new Map();
  for (const l of lines) { if (!groups.has(l.color_name)) groups.set(l.color_name, { rgb: l.rgb, items: [] }); groups.get(l.color_name).items.push(l); }
  let rows = '';
  for (const [color, g] of groups) {
    const n = g.items.reduce((a, l) => a + l.qty, 0);
    rows += `<tr class="grp"><td colspan="4"><span class="sw" style="background:#${esc(g.rgb || 'ccc')}"></span>${esc(color)}<small>${n} ${n === 1 ? 'peça' : 'peças'}</small></td></tr>`;
    rows += g.items.map((l) => `
      <tr><td><span class="pn">${esc(l.part_num)}</span><div class="sub">${esc(l.name)}</div></td>
        <td class="qty">${l.qty}×</td>
        <td><span class="badge ${l.status}">${LABEL[l.status]}</span>${l.canTry ? '<span class="try">dá para tentar imprimir</span>' : ''}
          <div class="sub">${esc(l.reason)}${l.meshWarning ? ' Malha com muitas arestas abertas: confira no fatiador.' : ''}</div></td>
        <td>${l.status !== 'buy' || l.canTry ? `<a href="/api/part/${encodeURIComponent(l.part_num)}.stl">STL</a>` : ''}</td></tr>`).join('');
  }
  $('#tbl').innerHTML = `<table><thead><tr><th>Peça</th><th style="text-align:right">Qtd</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

status();
route();
