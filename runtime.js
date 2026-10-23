(function(global){'use strict';
const R=global.FichaV2Rules,clone=value=>JSON.parse(JSON.stringify(value));
const attr=R.ATTRIBUTE_IDS;
const defaults={nome:'',classe:'',nivel:'1',assinatura:'',tipoNexo:'',patente:'',idade:'',origem:'',afiliacao:'',formaConjuracao:'',forca:'1',vigor:'1',agilidade:'1',intelecto:'1',presenca:'1',pvAtual:'0',pvMax:'0',pvTemporarios:'0',pnAtual:'0',pnMax:'0',psAtual:'20',psMax:'20',bonusDefesaEquipamento:'0',protecaoPrincipal:''};
const number=v=>Math.max(0,Number.isFinite(Number(v))?Number(v):0);
function empty(){return {schemaVersion:'0.3-pre-alpha',photo:'',fields:{...defaults},skills:{},equipment:[],enchantments:[],abilities:[],manifestations:[{nome:'Manifestação 1'}],automaticAbilityFavorites:{},notes:[],activeEffects:[],criticalStates:{dyingRounds:0,losingMindRounds:0,resonantRecoveryDefensePenalty:false},goldGeneration:{version:1,unlocked:false,active:false,officialEnhancements:{}}};}
function snapshot(state){const level=R.integerBetween(state.fields.nivel,1,11);return {classe:state.fields.classe,nivel:level,vigor:R.integerBetween(state.fields.vigor,1,level===11?6:5),intelecto:R.integerBetween(state.fields.intelecto,1,level===11?6:5)};}
function recalculate(state,trigger='restore',previous=null){
 const s=snapshot(state),max=R.computeClassMaximums(s);if(!max)return;
 const first=trigger==='classe'&&s.classe&&!previous?.classe&&number(state.fields.pvMax)===0&&number(state.fields.pnMax)===0;
 for(const [current,maximum,attribute] of [['pvAtual','pvMax','vigor'],['pnAtual','pnMax','intelecto'],['psAtual','psMax',null]]){
   const old=number(state.fields[maximum]),value=number(state.fields[current]);
   state.fields[maximum]=String(max[maximum]);
   if((first&&(current!=='psAtual'||value===0))||(s.nivel===1&&trigger===attribute&&value===old))state.fields[current]=String(max[maximum]);
 }
}
function normalizeAttributes(state){let apex=false;const max=Number(state.fields.nivel)===11?6:5;for(const id of attr){let value=R.integerBetween(state.fields[id],1,max);if(value===6){if(apex)value=5;else apex=true;}state.fields[id]=String(value);}}
function critical(state){if(state.criticalStates){if(number(state.fields.pvAtual)>0)state.criticalStates.dyingRounds=0;if(number(state.fields.psAtual)>0)state.criticalStates.losingMindRounds=0;}}
function restore(raw){const state=clone(raw);state.fields={...defaults,...state.fields};state.skills={...state.skills};state.fields.nivel=String(R.integerBetween(state.fields.nivel,1,11));normalizeAttributes(state);recalculate(state);critical(state);return state;}
function validate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('O JSON não contém uma ficha válida.');
 if(!/^0\.3(?:$|[.-])/i.test(raw.schemaVersion||''))throw Error('Versão incompatível: esperado um arquivo de ficha 0.3.');
 for(const key of ['fields','skills'])if(!raw[key]||typeof raw[key]!=='object'||Array.isArray(raw[key]))throw Error(`Estrutura ${key} inválida.`);
 for(const key of ['equipment','abilities','manifestations'])if(!Array.isArray(raw[key])||raw[key].length>500)throw Error(`Lista ${key} inválida.`);
 for(const [key,value]of Object.entries(raw.fields))if(!['string','number'].includes(typeof value))throw Error(`Campo ${key} inválido.`);
 for(const [key,value]of Object.entries(raw.skills))if(!Object.hasOwn(R.graus,value))throw Error(`Grau de ${key} inválido; o arquivo não foi alterado.`);
 if(raw.photo!==undefined&&(typeof raw.photo!=='string'||raw.photo&&!raw.photo.startsWith('data:image/')))throw Error('Imagem inválida.');
 return clone(raw);
}
function setField(state,id,value){
 const previous=snapshot(state),f=state.fields;
 if(attr.includes(id)){
   const max=Number(f.nivel)===11?6:5,next=R.integerBetween(value,1,max);
   if(next===6&&attr.some(other=>other!==id&&Number(f[other])===6))return {allowed:false,message:'O Ápice do Nexo já foi aplicado a outro atributo.'};
   const used=attr.reduce((sum,other)=>sum+Math.max(0,Number(other===id?next:f[other])-1),0);
   if(Number(f.nivel)===1&&used>1)return {allowed:false,message:'No nível 1, você possui apenas 1 ponto adicional para distribuir.'};
   f[id]=String(next);if(['vigor','intelecto'].includes(id))recalculate(state,id,previous);
 }else if(id==='nivel'){f.nivel=String(R.integerBetween(value,1,11));normalizeAttributes(state);recalculate(state,'nivel',previous);
 }else if(id==='classe'){if(!Object.hasOwn(R.classDefinitions,value)&&value!=='')return {allowed:false,message:'Classe não reconhecida.'};f.classe=value;recalculate(state,'classe',previous);
 }else if(/^(pv|pn|ps)(Atual|Max)$/.test(id)){
   if(id.endsWith('Max')&&R.computeClassMaximums(snapshot(state)))return {allowed:false,message:'Máximo calculado pela Classe, nível e atributos.'};
   let next=number(value);if(id.endsWith('Atual')){const max=number(f[id.replace('Atual','Max')]);if(max>0)next=Math.min(next,max);}f[id]=String(next);
 }else if(id==='pvTemporarios'||id==='idade'){f[id]=value===''&&id==='idade'?'':String(number(value));}
 else if(Object.hasOwn(defaults,id))f[id]=String(value);
 else return {allowed:false,message:'Campo não disponível na aba Geral.'};
 critical(state);return {allowed:true};
}
function setSkill(state,name,next){if(!R.pericias.some(([key])=>key===name)&&!(name==='Enganação'&&Object.hasOwn(state.skills,name)))return {allowed:false,message:'Perícia não disponível nesta ficha.'};const result=R.canChangeSkill(state,name,next);if(result.allowed)state.skills[name]=next;return result;}
function delta(state,id,amount){
 const f=state.fields,current=number(f[id]),max=number(f[id.replace('Atual','Max')]);
 if(id==='pvAtual'&&amount<0){const temp=number(f.pvTemporarios),absorbed=Math.min(temp,-amount);f.pvTemporarios=String(temp-absorbed);f[id]=String(Math.max(0,current+amount+absorbed));}
 else {const limit=max>0?max:Number.MAX_SAFE_INTEGER;f[id]=String(amount>0&&current>limit?current:Math.max(0,Math.min(limit,current+amount)));}critical(state);
}
function derived(state){const f=state.fields;return {threshold:R.calculateResonanceThreshold(f.nivel,f.intelecto),defense:10+Number(f.agilidade)+Math.min(R.graus[state.skills.Reflexos]||0,3)+Number(f.bonusDefesaEquipamento||0)+(state.criticalStates?.resonantRecoveryDefensePenalty?-3:0),skills:R.analyzeSkillDistribution(state.skills,f.nivel),attributePoints:1-attr.reduce((sum,id)=>sum+Math.max(0,Number(f[id])-1),0)};}
function demo(){const s=empty();s.fields.nome='Yuri Lima';s.fields.assinatura='Gelo';setField(s,'classe','Vanguarda');setField(s,'nivel','3');for(const id of attr)setField(s,id,{forca:4,vigor:4,agilidade:3,intelecto:2,presenca:3}[id]);for(const name of ['Atletismo','Acrobacia','Combate','Percepção','Reflexos','Vontade'])setSkill(s,name,'Praticante');return s;}
global.FichaV2Model=Object.freeze({empty,demo,restore,validate,snapshot,recalculate,setField,setSkill,delta,derived,clone,defaults});
})(typeof window==='undefined'?globalThis:window);
