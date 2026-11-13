/* Projection of shared data. Character edits stay in the canonical owner's sheet. */
(function (global) {
  'use strict';
  const node = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined) e.textContent = String(value);
    return e;
  };
  const tabs = [['summary', 'Resumo'], ['skills', 'Perícias'], ['manifestations', 'Manifestações'], ['abilities', 'Habilidades de Classe'], ['equipment', 'Equipamentos'], ['enchantments', 'Encantamentos'], ['effects', 'Efeitos']];
  const labels = { nome:'Nome',classe:'Classe',nivel:'Nível',assinatura:'Assinatura',forca:'Força',vigor:'Vigor',agilidade:'Agilidade',intelecto:'Intelecto',presenca:'Presença',tipoNexo:'Tipo de Nexo',formaConjuracao:'Forma de Conjuração',pvAtual:'PV atual',pvMax:'PV máximo',pnAtual:'PN atual',pnMax:'PN máximo',psAtual:'PS atual',psMax:'PS máximo',pvTemporarios:'PV temporários',bonusDefesaEquipamento:'Bônus de Defesa',origem:'Origem',afiliacao:'Afiliação',descricao:'Descrição',efeito:'Efeito',acao:'Ação',duracao:'Duração',alcance:'Alcance',limitacoes:'Limitações',custo:'Custo',dano:'Dano',teste:'Teste',alvo:'Alvo' };
  const label = key => labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  function values(host, data) {
    const list = node('dl','combat-sheet-values');
    Object.entries(data || {}).forEach(([key,value]) => {
      if (['id','photo','notes'].includes(key) || value === null || value === undefined || value === '' || typeof value === 'object') return;
      const pair = node('div');
      pair.append(node('dt','',label(key)),node('dd','',value)); list.append(pair);
    });
    host.append(list);
  }
  function showResult(host, entry) {
    host.replaceChildren(); host.hidden = !entry;
    if (!entry) return;
    const { title, result:r } = entry;
    const heading = node('div','combat-result-heading');
    heading.append(node('span','',title+' —'),node('strong','',r.total));
    const dice = node('div','combat-result-dice');
    let used = false;
    for (const value of r.rolls) {
      const chosen = r.resolution !== 'highest' || (!used && value === r.diceTotal);
      if (chosen) used = true;
      const pip = node('span',chosen?'is-used':'is-discarded',value);
      pip.setAttribute('aria-label',`${value}${chosen?' utilizado':' descartado'}`); dice.append(pip);
    }
    const signed = (Number(r.modifier) >= 0 ? '+' : '') + r.modifier;
    host.append(node('small','combat-result-eyebrow','Última rolagem'),heading,dice,
      node('p','',`${r.resolution === 'highest'?'Maior dado':'Dados'}: ${r.diceTotal} · bônus: ${signed}${r.resolution === 'highest'?' · os demais dados não entram na soma':''}`),
      node('small','combat-result-delivery',r.pending?'Envio pendente · resultado preservado':'Resultado registrado'));
  }
  function create({ snapshot, name, onRoll, ownAction, onResources, resourceVersion = null, onDraftChange = () => {}, defenseValue, state = {}, tab = 'summary', onTab = () => {} }) {
    const host = node('section','combat-sheet-view');
    const notice = node('p','online-combat-muted',ownAction ? 'Sua ficha no Confronto. Abra para usar os dados, recursos e ações do personagem.' : onRoll ? 'Exemplar independente · ações e recursos deste adversário' : 'Ficha compartilhada para consulta · alterações permanecem com o proprietário');
    host.append(notice);
    if (ownAction) {
      const open = node('button','btn combat-open-sheet','Abrir minha ficha no Confronto'); open.type = 'button';
      open.addEventListener('click',async () => {
        open.disabled = true;
        try { await ownAction(); }
        catch (error) { notice.textContent = error.message || 'Não foi possível abrir sua ficha.'; }
        finally { open.disabled = false; }
      });
      host.append(open);
    }
    const nav = node('nav','combat-sheet-tabs'); nav.setAttribute('aria-label',`Seções da ficha de ${name}`);
    const body = node('div','combat-sheet-body');
    async function perform(expression, title, output, button) {
      if (state.rolling) return;
      state.rolling = true; button.disabled = true; output.hidden = false; output.textContent = 'Rolando…';
      try {
        state.lastResult = {title,result:await onRoll(expression,title)};
        showResult(output,state.lastResult);
      } catch (e) { output.textContent = e.message || 'Não foi possível registrar a rolagem.'; }
      finally { state.rolling = false; button.disabled = false; }
    }
    const draw = key => {
      body.replaceChildren();
      nav.querySelectorAll('button').forEach(b => {
        b.classList.toggle('is-active',b.dataset.tab === key); b.setAttribute('aria-pressed',String(b.dataset.tab === key));
      });
      if (key === 'summary') {
        const fields = snapshot.fields || {};
        const identity = node('div','combat-summary-identity');
        values(identity,Object.fromEntries(['classe','nivel','assinatura','tipoNexo','formaConjuracao','origem','afiliacao'].filter(k => fields[k] !== undefined).map(k => [k,fields[k]])));
        const resources = node('div','combat-summary-resources');
        for (const [prefix,title] of [['pv','PV'],['pn','PN'],['ps','PS']]) {
          const card = node('div'); card.dataset.resource = prefix;
          card.append(node('small','',title),node('strong','',`${fields[prefix+'Atual'] ?? '—'} / ${fields[prefix+'Max'] ?? '—'}`));
          const current = Number(fields[prefix+'Atual']), max = Number(fields[prefix+'Max']);
          if (Number.isFinite(current) && max > 0) {
            const bar = node('progress'); bar.max = max; bar.value = Math.max(0,current); bar.setAttribute('aria-label',`${title}: ${current} de ${max}`); card.append(bar);
          }
          resources.append(card);
        }
        const defense = defenseValue ?? global.CronicasCombatRules?.defense?.(snapshot), def = node('div');
        def.append(node('small','','DEF'),node('strong','',Number.isFinite(defense)?defense:'—')); resources.append(def); body.append(resources);
        const attributes = node('div','combat-summary-attributes');
        for (const [key,title] of [['forca','FOR'],['vigor','VIG'],['agilidade','AGI'],['intelecto','INT'],['presenca','PRE']]) {
          const item = node('div'); item.append(node('small','',title),node('b','',fields[key] ?? '—')); attributes.append(item);
        }
        body.append(attributes,identity);
        if (snapshot.goldGeneration?.active) body.append(node('p','combat-mode-badge','Geração de Ouro ativa'));
        if (snapshot.coyoteEyes?.active) body.append(node('p','combat-mode-badge','Modo Coyote ativo'));
        const reserved = new Set(['nome','classe','nivel','assinatura','tipoNexo','formaConjuracao','origem','afiliacao','forca','vigor','agilidade','intelecto','presenca','pvAtual','pvMax','pnAtual','pnMax','psAtual','psMax']);
        const extra = Object.fromEntries(Object.entries(fields).filter(([k,v]) => !reserved.has(k) && v !== '' && v !== null));
        if (Object.keys(extra).length) {
          const details = node('details','combat-sheet-item'); details.append(node('summary','','Informações complementares')); values(details,extra); body.append(details);
        }
        if (onResources) {
          const form = node('form','combat-resource-editor');
          const editable = ['pv', 'pn', 'ps'].flatMap(resource => [
            {key: resource + 'Atual', label: resource.toUpperCase() + ' atual', value: fields[resource+'Atual'] ?? 0, min: 0},
            {key: resource + 'Max', label: resource.toUpperCase() + ' máximo', value: fields[resource+'Max'] ?? 1, min: resource === 'pv' ? 1 : 0}
          ]);
          editable.push({key: 'defense', label: 'DEF', value: defense ?? 0, min: 0});
          for (const {key, label, value, min} of editable) {
            const field = node('label', '', label), input = node('input');
            input.type = 'number';
            input.min = String(min);
            input.step = '1';
            input.required = true;
            input.name = key;
            input.value = state.resourceDraft?.values[key] ?? value;
            input.inputMode = 'numeric';
            input.dataset.focusKey = 'resource:' + key;
            input.addEventListener('input', () => {
              if (!state.resourceDraft) {
                state.resourceDraft = {values: Object.fromEntries(editable.map(entry => [entry.key, String(entry.value)])), expectedUpdatedAt: resourceVersion};
              }
              state.resourceDraft.values[key] = input.value;
              input.dataset.dirty = 'true';
              onDraftChange();
            });
            if (state.resourceDraft) input.dataset.dirty = 'true';
            field.append(input);
            form.append(field);
          }
          const save = node('button','btn','Salvar recursos'); save.type = 'submit'; form.append(save);
          const discard=node('button','btn secondary','Descartar alterações');discard.type='button';discard.dataset.focusKey='discard-resources';discard.addEventListener('click',()=>{if(state.saving)return;delete state.resourceDraft;draw('summary');onDraftChange();});form.append(discard);
          save.dataset.focusKey='save-resources';
          const status = node('p'); status.setAttribute('role','status');
          form.addEventListener('submit',async e => {
            e.preventDefault(); if (state.saving || !form.reportValidity()) return; state.saving=true;save.disabled = true;discard.disabled=true;nav.querySelectorAll('button').forEach(b=>b.disabled=true);onDraftChange();
            try {
              const {defense: savedDefense, ...changes} = Object.fromEntries([...form.querySelectorAll('input')].map(i => [i.name,i.value]));
              const receipt=await onResources(changes,state.resourceDraft?.expectedUpdatedAt ?? resourceVersion, Number(savedDefense));if(receipt?.updatedAt)resourceVersion=receipt.updatedAt;Object.assign(snapshot.fields,changes);delete state.resourceDraft;
              form.querySelectorAll('[data-dirty]').forEach(i => delete i.dataset.dirty); status.textContent = 'Recursos do exemplar salvos.';
              defenseValue = Number(savedDefense);
              def.querySelector('strong').textContent = String(defenseValue);
              for (const prefix of ['pv', 'pn', 'ps']) {
                const card = resources.querySelector(`[data-resource=${prefix}]`);
                const current = changes[prefix + 'Atual'], max = changes[prefix + 'Max'];
                card.querySelector('strong').textContent = `${current} / ${max}`;
                const bar = card.querySelector('progress');
                if (bar && Number(max) > 0) {
                  bar.max = Number(max);
                  bar.value = Number(current);
                  bar.setAttribute('aria-label', `${prefix.toUpperCase()}: ${current} de ${max}`);
                } else if (bar) {
                  bar.remove();
                }
              }
            } catch (_) { status.textContent = 'Não foi possível salvar. Atualize para conferir alterações em outra tela.'; }
            finally { state.saving=false;save.disabled = false;discard.disabled=false;nav.querySelectorAll('button').forEach(b=>b.disabled=false);onDraftChange(); }
          }); body.append(form,status);
        }
        return;
      }
      const result = node('div','combat-roll-result'); result.setAttribute('role','status'); showResult(result,state.lastResult);
      if (key === 'skills') {
        const search = node('input','combat-skill-search'); search.type = 'search'; search.placeholder = 'Buscar Perícia'; search.setAttribute('aria-label','Buscar Perícia na ficha consultada'); search.value=state.search || '';
        const list = node('div','combat-skill-list');
        const render = () => {
          list.replaceChildren(); let countFound=0;
          const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');state.search=search.value;
          for (const skill of global.CronicasCombatRules?.skills?.() || []) {
            if (!skill.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(query)) continue;
            countFound++;
            const degree=snapshot.skills?.[skill.name] || 'Sem Domínio', bonus=global.CronicasCombatRules.bonus(degree), count=Number(snapshot.fields?.[skill.field]);
            const row=node('div','combat-skill-row'); row.append(node('span','',`${skill.name} (${skill.attribute})`),node('small','',`${degree} · bônus +${bonus}`));
            if (onRoll) {
              const roll=node('button','btn secondary','Rolar'); roll.type='button'; roll.setAttribute('aria-label',`Rolar ${skill.name} de ${name}`); roll.disabled=!Number.isInteger(count)||count<1||count>10;
              roll.addEventListener('click',() => void perform(`${count}d20${bonus?'+'+bonus:''}`,skill.name,result,roll)); row.append(roll);
            }
            list.append(row);
          }
          if(!countFound)list.append(node('p','online-combat-muted','Nenhuma Perícia encontrada.'));
        };
        search.addEventListener('input',render); body.append(search,result,list); render(); return;
      }
      body.append(result);
      let items=snapshot[key] || [];
      if (key==='manifestations' && global.CoyoteEyes?.activeRecords) items=global.CoyoteEyes.activeRecords(snapshot);
      if (key==='abilities') items=[...(global.CronicasCombatRules?.abilities?.(snapshot) || []),...items];
      if (key==='effects') items=snapshot.activeEffects || [];
      if (!items.length) { body.append(node('p','online-combat-muted','Nenhum registro compartilhado nesta seção.')); return; }
      for (const item of items) {
        const details=node('details','combat-sheet-item'); details.append(node('summary','',item.nome || item.name || 'Registro')); values(details,item);
        if (onRoll) for (const field of ['dano','teste','rolagem','expressao']) {
          const parsed=typeof item[field]==='string'?global.CronicasDiceEngine?.parse(item[field]):null;
          if (!parsed?.valid) continue;
          const button=node('button','btn secondary',`Rolar ${label(field).toLocaleLowerCase('pt-BR')} · ${parsed.expression}`); button.type='button';
          button.addEventListener('click',() => void perform(parsed.expression,`${item.nome || item.name || 'Ação'} — ${label(field)}`,result,button)); details.append(button);
        }
        body.append(details);
      }
    };
    for (const [key,title] of tabs) {
      const b=node('button','',title); b.type='button'; b.dataset.tab=key;
      b.dataset.focusKey='sheet-tab:'+key;b.addEventListener('click',() => { if(state.saving)return;onTab(key); draw(key);onDraftChange(); }); nav.append(b);
    }
    host.append(nav,body); draw(tabs.some(([key])=>key===tab)?tab:'summary'); return host;
  }
  global.CombatSheetView=Object.freeze({create,showResult});
})(window);
