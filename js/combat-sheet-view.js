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
    const notice = node('p','online-combat-muted',ownAction ? 'Sua ficha no Confronto. Abra para usar os dados, recursos e ações do personagem.' : onRoll ? 'Adversário independente · os recursos deste exemplar são controlados aqui e não acompanham a ficha de origem.' : 'Ficha compartilhada para consulta · alterações permanecem com o proprietário');
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
        const quick = [];
        const feedback = node('p','combat-resource-status'); feedback.setAttribute('role','status');
        const keys = ['pv','pn','ps'];
        let pendingSteps = [];
        let savingSteps = false;
        const resourceValues = new Map();
        function displayFields(values) {
          for (const [prefix, card] of resourceValues) {
            const current = values[prefix+'Atual'], max = values[prefix+'Max'];
            card.querySelector('strong').textContent = `${current ?? '—'} / ${max ?? '—'}`;
            const bar = card.querySelector('progress');
            if (bar) {
              bar.value = Number(current);
              bar.setAttribute('aria-label', `${prefix.toUpperCase()}: ${current} de ${max}`);
            }
          }
        }
        const applySteps = (values, steps) => {
          const next = {...values};
          for (const {key,maxKey,step} of steps) {
            const current = Number(next[key]), max = Number(next[maxKey]);
            if (step < 0) next[key] = String(Math.max(0,current+step));
            else if (current < max) next[key] = String(Math.min(max,current+step));
          }
          return next;
        };
        const syncQuick = () => quick.forEach(({button,key,maxKey,step}) => {
          const displayed = applySteps(fields,pendingSteps);
          const current = Number(displayed[key]), max = Number(displayed[maxKey]);
          button.disabled = !!((state.saving && !savingSteps) || state.resourceDraft) || (step < 0 ? current <= 0 : current >= max);
        });
        for (const [prefix,title] of [['pv','PV'],['pn','PN'],['ps','PS']]) {
          const card = node('div'); card.dataset.resource = prefix;
          card.append(node('small','',title),node('strong','',`${fields[prefix+'Atual'] ?? '—'} / ${fields[prefix+'Max'] ?? '—'}`));
          const current = Number(fields[prefix+'Atual']), max = Number(fields[prefix+'Max']);
          if (Number.isFinite(current) && max > 0) {
            const bar = node('progress'); bar.max = max; bar.value = Math.max(0,current); bar.setAttribute('aria-label',`${title}: ${current} de ${max}`); card.append(bar);
          }
          if (onResources && Number.isFinite(current) && Number.isFinite(max)) {
            const controls = node('div','combat-resource-quick');
            for (const [step,label] of [[-1,'−1'],[1,'+1'],[-5,'−5'],[5,'+5']]) {
              const button = node('button','',label); button.type = 'button';
              const key = prefix+'Atual', maxKey = prefix+'Max';
              button.dataset.focusKey = `step:${key}:${step}`;
              button.dataset.direction = step < 0 ? 'loss' : 'gain';
              button.setAttribute('aria-label',`${step < 0 ? 'Diminuir' : 'Recuperar'} ${Math.abs(step)} ${title}`);
              quick.push({button,key,maxKey,step}); controls.append(button);
              button.addEventListener('click', () => {
                if (button.disabled) return;
                pendingSteps.push({key,maxKey,step});
                displayFields(applySteps(fields,pendingSteps));
                syncQuick();
                void flushSteps();
              });
            }
            card.append(controls);
          }
          resourceValues.set(prefix,card); resources.append(card);
        }
        const defense = defenseValue ?? global.CronicasCombatRules?.defense?.(snapshot), def = node('div');
        def.append(node('small','','DEF'),node('strong','',Number.isFinite(defense)?defense:'—')); resources.append(def); body.append(resources);
        if (onResources) { feedback.textContent = state.resourceFeedback || ''; body.append(feedback); }
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
          const options = node('details','combat-sheet-item combat-resource-options');
          options.open = !!(state.resourceDraft || state.resourceOptionsOpen);
          options.addEventListener('toggle', () => { if (options.isConnected) state.resourceOptionsOpen = options.open; });
          const summary = node('summary','','Ajustar valores e defesa'); summary.dataset.focusKey = 'resource-options';
          const form = node('form','combat-resource-editor');
          options.append(summary,form); body.append(options);
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
              syncQuick(); onDraftChange();
            });
            if (state.resourceDraft) input.dataset.dirty = 'true';
            field.append(input);
            form.append(field);
          }
          const save = node('button','btn','Salvar recursos'); save.type = 'submit'; form.append(save);
          const discard=node('button','btn secondary','Descartar alterações');discard.type='button';discard.dataset.focusKey='discard-resources';discard.addEventListener('click',()=>{if(state.saving)return;delete state.resourceDraft;draw('summary');onDraftChange();});form.append(discard);
          save.dataset.focusKey='save-resources';
          form.addEventListener('submit', e => {
            e.preventDefault();
            if (state.saving || !form.reportValidity()) return;
            const {defense: savedDefense, ...changes} = Object.fromEntries([...form.querySelectorAll('input')].map(i => [i.name,i.value]));
            void saveResources(changes,state.resourceDraft?.expectedUpdatedAt ?? resourceVersion,Number(savedDefense),save.dataset.focusKey,'Recursos do adversário salvos.');
          });
        }
        syncQuick();
        async function flushSteps() {
          if (savingSteps || state.saving) return;
          savingSteps = state.saving = true;
          const controls = [...body.querySelectorAll('form input, form button'),...nav.querySelectorAll('button')];
          controls.forEach(control => control.disabled = true);
          feedback.textContent = 'Salvando…';
          onDraftChange();
          try {
            while (pendingSteps.length) {
              const count = pendingSteps.length;
              const next = applySteps(fields,pendingSteps.slice(0,count));
              const changes = Object.fromEntries(keys.flatMap(key => ['Atual','Max'].map(suffix => {
                const field = key+suffix;
                return [field,String(next[field] ?? (field === 'pvMax' ? 1 : 0))];
              })));
              const receipt = await onResources(changes,resourceVersion,Number(defense ?? 0));
              if (receipt?.updatedAt) resourceVersion = receipt.updatedAt;
              Object.assign(fields,changes);
              pendingSteps = pendingSteps.slice(count);
            }
            for (const input of body.querySelectorAll('form input')) {
              if (fields[input.name] !== undefined) input.value = fields[input.name];
            }
            state.resourceFeedback = 'Recursos salvos.';
          } catch (_) {
            pendingSteps = [];
            state.resourceFeedback = 'Não foi possível salvar. O cartão voltou ao último valor confirmado.';
          } finally {
            savingSteps = state.saving = false;
            displayFields(fields);
            syncQuick();
            controls.forEach(control => control.disabled = false);
            feedback.textContent = state.resourceFeedback;
            onDraftChange();
          }
        }
        async function saveResources(changes, expected, savedDefense, focusKey, message) {
          if (state.saving) return;
          state.saving = true;
          const previousFocus = document.activeElement?.dataset.focusKey === focusKey;
          const controls = [...body.querySelectorAll('form input, form button'),...nav.querySelectorAll('button')];
          controls.forEach(control => control.disabled = true);
          syncQuick(); feedback.textContent = 'Salvando…'; onDraftChange();
          try {
            const receipt = await onResources(changes,expected,savedDefense);
            if (receipt?.updatedAt) resourceVersion = receipt.updatedAt;
            Object.assign(fields,changes); snapshot.fields = fields; defenseValue = savedDefense;
            delete state.resourceDraft;
            state.resourceFeedback = message;
            state.saving = false;
            draw('summary');
            if (previousFocus && document.activeElement === document.body) {
              const buttons = [...body.querySelectorAll('button')];
              (buttons.find(button => button.dataset.focusKey === focusKey && !button.disabled)
                || buttons.find(button => button.dataset.focusKey?.startsWith(focusKey.slice(0,focusKey.lastIndexOf(':')+1)) && !button.disabled))?.focus();
            }
          } catch (_) {
            state.resourceFeedback = 'Não foi possível salvar. Atualize o confronto e confira os valores.';
            feedback.textContent = state.resourceFeedback;
          } finally {
            state.saving = false; controls.forEach(control => control.disabled = false); syncQuick(); onDraftChange();
          }
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
