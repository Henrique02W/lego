// Classificação de cada peça: imprimir, imprimir com ressalvas ou comprar.
//
// Implementação própria. A lógica é conservadora de propósito: comprar uma peça
// pequena custa centavos, uma impressão que falha custa horas. Tudo o que não está
// numa regra de impressão vai para "comprar".
//
// Entrada (linha do inventário): { name, cat, material, is_trans, printed }
// Saída: { status: 'print' | 'caveat' | 'buy', ruleId, reason, tryPrint? }

export const LIMITS = {
  maxMm: 240,   // maior dimensão que cabe numa mesa comum de 256 mm, com folga
  thinMm: 1.0,  // menor dimensão abaixo disso: fino demais para imprimir com segurança
};

const has = (re, s) => re.test(s || '');

// Regras de compra. A primeira que bater decide.
const BUY = [
  { id: 'transparent', tryPrint: true, reason: 'Cor transparente: precisa de plástico translúcido. Impressa em plástico comum fica opaca.',
    test: (l) => !!l.is_trans },
  { id: 'printed', tryPrint: true, reason: 'Peça decorada (estampada ou com adesivo). Impressa sai lisa, sem o desenho.',
    test: (l) => !!l.printed || has(/\b(pattern|sticker|decorated|printed)\b/i, l.name) || has(/sticker/i, l.cat) },
  { id: 'material', reason: 'Não é plástico rígido (borracha, tecido, corda...).',
    test: (l) => !!l.material && !/^plastic$/i.test(l.material) },
  { id: 'figure', reason: 'Peça de minifigura: pequena e cheia de detalhes.',
    test: (l) => has(/minifig|minidoll|figure/i, l.cat) },
  { id: 'flexible', reason: 'Peça flexível (pneu, mangueira, corda, tecido).',
    test: (l) => has(/hose|string|cloth|fabric|rubber|flexible|tyre|tire/i, l.cat)
      || has(/\b(tyre|tire|rubber|hose|string|cord|cloth|fabric|sail|net|chain)\b/i, l.name) },
  { id: 'electronic', reason: 'Peça eletrônica, motor, luz ou ímã.',
    test: (l) => has(/electronic|power functions|powered up|motor/i, l.cat)
      || has(/\b(battery|motor|led|magnet|sensor|light brick|light unit)\b/i, l.name) },
  { id: 'thin', reason: 'Peça fina ou delicada demais para imprimir com segurança.',
    test: (l) => has(/\b(antenna|whip|flag|leaf|leaves|plume|spring)\b/i, l.name) },
  { id: 'glass', reason: 'Vidro ou para-brisa: a peça original é transparente.',
    test: (l) => has(/\b(glass|windscreen|windshield)\b/i, l.name) },
  { id: 'baseplate', reason: 'Placa-base: grande e fina, cara de imprimir e barata de comprar.',
    test: (l) => has(/baseplate/i, `${l.cat} ${l.name}`) },
];

// Regras de impressão com ressalvas (peças em que a tolerância ou o esforço pesam).
const CAVEAT = [
  { id: 'gear', reason: 'Engrenagem: dentes pequenos exigem precisão. Imprima uma para testar antes das demais.',
    test: (l) => has(/\bgear\b/i, `${l.cat} ${l.name}`) },
  { id: 'axle-pin', reason: 'Eixo, pino ou conector: o encaixe depende da tolerância da sua impressora. Imprima um de teste.',
    test: (l) => has(/technic.*(pin|axle|connector|bush)|^(pins|axles)\b/i, l.cat)
      || has(/\b(axle|pin)\b/i, l.name) },
  { id: 'clip-hinge', reason: 'Dobradiça, clipe ou barra: trabalha sob esforço e pode quebrar na camada.',
    test: (l) => has(/hinge|clip|handle|bar\b|lever/i, `${l.cat} ${l.name}`) },
];

// Regras de impressão simples.
const PRINT = [
  { id: 'wheel-rim', reason: 'Aro de roda (plástico rígido). O pneu de borracha é comprado.',
    test: (l) => has(/wheel/i, `${l.cat} ${l.name}`) && !has(/tyre|tire|rubber/i, `${l.cat} ${l.name}`) },
  { id: 'technic-beam', reason: 'Viga ou bloco Technic simples.',
    test: (l) => has(/technic/i, l.cat) },
  { id: 'basic', reason: 'Bloco, placa, tile, inclinado ou curvo simples.',
    test: (l) => has(/brick|plate|tile|slope|wedge|arch|cone|cylinder|round|panel|window|door|frame|container|support|ladder|fence/i, l.cat) },
];

export function classifyBase(line) {
  const l = { name: '', cat: '', material: '', ...line };
  for (const r of BUY) {
    if (r.test(l)) return { status: 'buy', ruleId: r.id, reason: r.reason, ...(r.tryPrint ? { tryPrint: true } : {}) };
  }
  for (const r of CAVEAT) {
    if (r.test(l)) return { status: 'caveat', ruleId: r.id, reason: r.reason };
  }
  for (const r of PRINT) {
    if (r.test(l)) return { status: 'print', ruleId: r.id, reason: r.reason };
  }
  return { status: 'buy', ruleId: 'unlisted', reason: 'Fora da lista de peças imprimíveis.' };
}

// Refina o resultado com a geometria real (resultado de shapes.js).
// shape: { ok, dims:[x,y,z] mm, openEdges, error? } ou undefined (ainda não verificado).
export function refine(base, shape) {
  if (!shape) return { ...base, shapeChecked: false };
  const out = { ...base, shapeChecked: true };
  if (base.status === 'buy') {
    // Peças compradas por decoração ou transparência podem ser tentadas se existir forma.
    if (base.tryPrint && shape.ok && Math.max(...shape.dims) <= LIMITS.maxMm) out.canTry = true;
    delete out.tryPrint;
    return out;
  }
  if (!shape.ok) {
    return { ...out, status: 'buy', ruleId: 'no-shape', reason: shape.error || 'Sem arquivo de forma para esta peça.' };
  }
  const longest = Math.max(...shape.dims);
  const thinnest = Math.min(...shape.dims);
  if (longest > LIMITS.maxMm) {
    return { ...out, status: 'buy', ruleId: 'oversize',
      reason: `Grande demais para a mesa (${Math.round(longest)} mm; limite ${LIMITS.maxMm} mm).` };
  }
  if (thinnest < LIMITS.thinMm) {
    return { ...out, status: 'buy', ruleId: 'tiny',
      reason: `Fina demais para imprimir com segurança (${thinnest.toFixed(1)} mm).` };
  }
  // Peças LDraw com pinos têm junções entre primitivas (~30% de arestas "abertas" em um tijolo 2x4
  // real, medido). Só avisa quando for desproporcional.
  if (shape.tris && shape.openEdges / shape.tris > 0.6) out.meshWarning = true;
  return out;
}

export const STATUS_LABEL = { print: 'Imprimir', caveat: 'Imprimir com ressalvas', buy: 'Comprar' };
