(function (global) {
  'use strict';
  const originalRecords = [
  {
    "nome": "PRECISÃO FANTASMAGÓRICA",
    "custo": "2",
    "acao": "movimento",
    "alcance": "curto",
    "alvo": "Uma criatura",
    "duracao": "Instantâneo",
    "teste": "",
    "tipo": "Ofensiva",
    "descricao": "",
    "efeito": "caso erre um tiro eu posso rerolar o teste",
    "limitacoes": ""
  },
  {
    "nome": "MEMORIA  FANTASMAGÓRICA",
    "custo": "2",
    "acao": "Padrão",
    "alcance": "Próprio",
    "alvo": "criatura",
    "duracao": "Instantâneo",
    "teste": "",
    "tipo": "Defensiva",
    "descricao": "O alvo encara o olho direito de Coyote, relembrando os fantasmas que ainda o atormentam.",
    "efeito": "O alvo realiza: Vontade contra o Limiar de Ressonância de Coyote.\nEm caso de falha: Assustado por 1d4 rodadas.",
    "limitacoes": ""
  },
  {
    "nome": "SOLIDÃO FANTASMAGÓRICA",
    "custo": "02",
    "acao": "Livre",
    "alcance": "",
    "alvo": "Pessoal",
    "duracao": "1d4 rodadas",
    "teste": "",
    "tipo": "",
    "descricao": "Coyote permite que o próprio medo tome conta de sua percepção. Durante o efeito, seus aliados passam a\nparecer figuras fantasmagóricas, ameaçadoras e hostis aos olhos dele. Coyote sabe racionalmente quem eles\nsão, mas sua percepção insiste em tratá-los como algo assustador.",
    "efeito": "Enquanto ativa:\n• Coyote fica Abalado (sofre -1d20 em testes de Vontade); \n• recebe +2 em Pontaria.\nDepois de ativada, a habilidade não pode ser encerrada voluntariamente antes do fim da duração.\nSolidão Fantasmagórica não recebe benefício adicional do Aprimoramento.\nNão transforme +2 Pontaria em +4.",
    "limitacoes": ""
  }
];
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const fields = ['nome','custo','acao','alcance','alvo','duracao','teste','tipo','descricao','efeito','limitacoes'];
  function records(list) {
    if (!Array.isArray(list) || list.length > 500) throw new Error('Lista dos olhos inválida.');
    return list.map(item => {
      if (!plain(item)) throw new Error('Manifestação dos olhos inválida.');
      for (const key of fields) if (item[key] !== undefined && !['string','number'].includes(typeof item[key])) throw new Error('Campo de Manifestação inválido.');
      if (item.coyoteRecordId !== undefined && (typeof item.coyoteRecordId !== 'string' || !item.coyoteRecordId || item.coyoteRecordId.length > 128)) throw new Error('Identidade da Manifestação inválida.');
      if (item.signatureEnhancement !== undefined) global.GoldGeneration.configuration(item.signatureEnhancement);
      if (item.custo !== undefined && (!Number.isFinite(Number(item.custo)) || Number(item.custo) < 0)) throw new Error('Custo de Manifestação inválido.');
      return clone(item);
    });
  }
  function normalize(value) {
    if (value === undefined) return undefined;
    if (!plain(value) || value.version !== 1 || !['right','left'].includes(value.activeEye)) throw new Error('Estado dos olhos inválido.');
    if (typeof value.unlocked !== 'boolean' || typeof value.firstRevealSeen !== 'boolean') throw new Error('Desbloqueio dos olhos inválido.');
    if (!value.unlocked && value.activeEye !== 'right') throw new Error('Olho esquerdo ainda não desbloqueado.');
    if (typeof value.blockedRightRecordId !== 'string' || !value.blockedRightRecordId || value.blockedRightRecordId.length > 128) throw new Error('Vínculo de Solidão inválido.');
    return { version:1, unlocked:value.unlocked, activeEye:value.activeEye, firstRevealSeen:value.firstRevealSeen,
      blockedRightRecordId:value.blockedRightRecordId, confidentManifestations:records(value.confidentManifestations) };
  }
  function initialConfident() {
    const create = (nome,custo,descricao) => ({ nome,custo,acao:'',alcance:'',alvo:'',duracao:'',teste:'',tipo:'',descricao,efeito:'',limitacoes:'' });
    return [
      create('Eco Fantasmagórico','3','Após acertar um inimigo com um disparo, Coyote ativa seu olho esquerdo e faz a trajetória do projétil se repetir como um eco fantasmagórico.\n\nEle escolhe um segundo inimigo próximo ao primeiro e realiza outro teste de Pontaria.\n\nSe acertar, o eco causa 1d6 de dano adicional ao segundo alvo.'),
      create('Passagem Fantasmagórica','2','Por meio do olho esquerdo, Coyote atravessa brevemente o limite entre o mundo físico e o fantasmagórico.\n\nEle pode se deslocar instantaneamente até 6 metros, para um espaço desocupado que consiga enxergar.\n\nNão pode atravessar paredes completamente fechadas.'),
      create('Descompasso Fantasmagórico','2','Coyote fixa seu olho esquerdo em um inimigo dentro de alcance curto, interferindo em sua percepção da realidade.\n\nO alvo realiza um teste de Vontade contra o Limiar de Ressonância.\n\nSe falhar, não pode realizar reações até o início do próximo turno de Coyote.')
    ];
  }
  function initialize(character) {
    const next = clone(character);
    if (next.coyoteEyes !== undefined) { next.coyoteEyes = normalize(next.coyoteEyes); return next; }
    const candidates = (next.manifestations || []).filter(record => fields.every(key => record[key] === originalRecords[2][key]));
    if (candidates.length !== 1) throw new Error('A identidade da Manifestação original Solidão precisa ser confirmada antes do desbloqueio. Nenhum dado foi alterado.');
    const id = global.crypto.randomUUID();
    candidates[0].coyoteRecordId = id;
    next.coyoteEyes = { version:1, unlocked:false, activeEye:'right', firstRevealSeen:false, blockedRightRecordId:id, confidentManifestations:initialConfident() };
    return next;
  }
  function eligible(character) {
    if (character?.coyoteEyes !== undefined) {
      const eyes=character.coyoteEyes;
      return plain(eyes) && eyes.version===1 && typeof eyes.unlocked==='boolean'
        && ['right','left'].includes(eyes.activeEye) && Array.isArray(eyes.confidentManifestations)
        && typeof eyes.blockedRightRecordId==='string' && Boolean(eyes.blockedRightRecordId);
    }
    // Bootstrap older exports by their complete original bundle, never just name or account.
    return Array.isArray(character?.manifestations) && originalRecords.every(reference =>
      character.manifestations.some(record => plain(record) && fields.every(key => record[key]===reference[key])));
  }
  let hooks, index=0, lastKey=0, busy=false, currentIdentity='', animationTimer;
  const sequence=['ArrowLeft','ArrowRight','KeyC','KeyO','KeyY'];
  function resetSequence() { index=0; lastKey=0; }
  function bound() { return Boolean(hooks && eligible(hooks.read())); }
  function effectiveEye(character) { return eligible(character) && character.coyoteEyes?.unlocked ? character.coyoteEyes.activeEye : 'right'; }
  function activeRecords(character) { return effectiveEye(character) === 'left' ? character.coyoteEyes.confidentManifestations : character.manifestations; }
  function capture(character, visibleRecords) {
    if (effectiveEye(character) === 'left') character.coyoteEyes.confidentManifestations=visibleRecords;
    else character.manifestations=visibleRecords;
  }
  function canEnhance(card) {
    const data=hooks?.read()?.coyoteEyes;
    // Before the portable state has persisted its record ID, protect the exact original record.
    if (bound() && !data && fields.every(key => card.querySelector(`[data-field="${key}"]`)?.value === originalRecords[2][key])) return false;
    return !(data?.blockedRightRecordId && card.dataset.coyoteRecordId === data.blockedRightRecordId);
  }
  async function prepareFeature() {
    if (busy || !bound() || !hooks.canEdit() || hooks.read().coyoteEyes) return;
    busy=true;
    try {
      await hooks.switchEye(initialize,true);
      refresh();
    } catch(error) { hooks.feedback(error.message,'error'); }
    finally { busy=false; }
  }
  function refresh() {
    if (!hooks) return;
    const identity=hooks.identity(), character=hooks.read(), panel=document.getElementById('contentPanelManifestacoes');
    const label=document.getElementById('coyoteEyeLabel');
    if (identity!==currentIdentity) { resetSequence(); clearTimeout(animationTimer); panel.querySelector('.coyote-reveal')?.remove(); panel.classList.remove('coyote-revealing','coyote-switching'); currentIdentity=identity; }
    const eye=effectiveEye(character);
    const revealed=bound() && character.coyoteEyes?.unlocked;
    label.hidden=!revealed;
    label.textContent=revealed ? (eye==='left' ? 'OLHO ESQUERDO — CONFIANTE' : 'OLHO DIREITO — INSEGURO') : '';
    if (revealed) panel.dataset.coyoteEye=eye; else delete panel.dataset.coyoteEye;
  }
  function animate(first) {
    const panel=document.getElementById('contentPanelManifestacoes');
    clearTimeout(animationTimer);
    panel.querySelector('.coyote-reveal')?.remove();
    panel.classList.remove('coyote-revealing','coyote-switching');
    if (first) {
      const overlay=document.createElement('div'); overlay.className='coyote-reveal'; overlay.setAttribute('aria-hidden','true');
      const eye=document.createElement('span'); eye.className='coyote-spectral-eye'; eye.textContent='◉';
      const title=document.createElement('strong'); title.textContent='OLHO ESQUERDO — CONFIANTE'; overlay.append(eye,title); panel.append(overlay);
      panel.classList.add('coyote-revealing');
      animationTimer=setTimeout(() => { overlay.remove(); panel.classList.remove('coyote-revealing'); }, global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 1400);
    } else { panel.classList.add('coyote-switching'); animationTimer=setTimeout(() => panel.classList.remove('coyote-switching'),350); }
  }
  async function toggle() {
    resetSequence();
    if (busy || !bound() || !hooks.canEdit() || document.getElementById('characterSheetView').hidden || !document.getElementById('modalOverlay').hidden || document.querySelector('dialog[open]')) return false;
    busy=true;
    try {
      const result=await hooks.switchEye(initialize);
      if (!result?.ok) return false;
      refresh(); animate(result.first); return true;
    } catch(error) { hooks.feedback(error.message,'error'); return false; }
    finally { busy=false; }
  }
  function configure(value) {
    hooks=value;
    document.addEventListener('keydown',event => {
      if (!bound() || !hooks.canEdit() || document.getElementById('characterSheetView').hidden || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
        || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"]')
        || !document.getElementById('modalOverlay').hidden || document.querySelector('dialog[open]')) { resetSequence(); return; }
      const now=Date.now(); if (now-lastKey>2000) index=0;
      index=event.code===sequence[index] ? index+1 : event.code==='ArrowLeft' ? 1 : 0;
      lastKey=now; if(index===sequence.length) void toggle();
    });
    global.addEventListener('blur',resetSequence);
    document.addEventListener('visibilitychange',() => { if(document.hidden) resetSequence(); });
    global.addEventListener('cronicas:character-edit-authority',() => { resetSequence(); refresh(); prepareFeature(); });
    global.addEventListener('cronicas:auth-change',() => { resetSequence(); prepareFeature(); });
    refresh();
    prepareFeature();
  }
  global.CoyoteEyes=Object.freeze({normalize,records,initialConfident,initialize,eligible,effectiveEye,activeRecords,capture,canEnhance,configure,refresh,toggle,resetSequence});
})(window);
