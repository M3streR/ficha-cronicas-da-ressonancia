const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../engine/script.js'),'utf8');
const from=source.indexOf('const QUICK_DICE_LIMITS'),to=source.indexOf("window.addEventListener('cronicas:character-sync-state'",from);
const context=vm.createContext({Math,crypto:require('node:crypto').webcrypto});
vm.runInContext(source.slice(from,to)+';this.dice={parse:parseDiceExpression,roll:rollDiceExpression,format:formatDiceResult}',context);
function check(expression,faces,total,natural,resolution){let calls=0;const result=context.dice.roll(context.dice.parse(expression),()=>faces[calls++]);assert.equal(calls,faces.length);assert.deepEqual(Array.from(result.rolls),faces);assert.equal(result.total,total);assert.equal(result.natural,natural);assert.equal(result.resolution,resolution);return result;}
test('2d20 keeps highest in both orders, modifiers once, ties and natural values',()=>{
 for(const faces of [[18,5],[5,18]]){const result=check('2d20+3',faces,21,18,'highest');assert.equal(result.selectedIndex,faces.indexOf(18));assert.match(context.dice.format(result).calculationText,/Maior/);}
 check('2d20-3',[18,5],15,18,'highest');check('2d20',[4,4],4,4,'highest');check('2d20+9',[20,1],29,20,'highest');check('2d20+19',[1,1],20,1,'highest');check('2d20-1',[1,2],1,2,'highest');
});
test('other dice retain sums; single d20 natural is independent of total',()=>{
 check('2d6+3',[6,5],14,null,'sum');check('3d8-2',[8,7,2],15,null,'sum');check('1d20+19',[1],20,1,'sum');check('1d20-19',[20],1,20,'sum');check('2d100',[20,1],21,null,'sum');
});

test('manual and skill pools use the same highest d20 rule',()=>{let calls=0;const r=context.dice.roll(context.dice.parse('3d20+3'),()=>[5,18,7][calls++],{highestD20:true});assert.equal(calls,3);assert.equal(r.total,21);assert.equal(r.natural,18);assert.equal(r.selectedIndex,1);const manual=check('3d20+3',[5,18,7],21,18,'highest');assert.equal(manual.total,r.total);});

test('confirmed skill pools from 3 to 6 d20 keep exactly one highest die for every degree',()=>{
 for(let quantity=3;quantity<=6;quantity++)for(const modifier of [0,3,6,9]){
  const values=[5,18,7,4,2,11].slice(0,quantity);let calls=0;
  const r=context.dice.roll(context.dice.parse(`${quantity}d20+${modifier}`),()=>values[calls++],{highestD20:true});
  assert.equal(calls,quantity);assert.deepEqual(Array.from(r.rolls),values);assert.equal(r.total,18+modifier);assert.equal(r.natural,18);assert.equal(r.selectedIndex,1);
 }
});

test('manual pools 3–6 d20 preserve every die, ties, order, modifier and chosen natural',()=>{
 for(let count=3;count<=6;count++)for(const modifier of [-3,0,3,6,9]){
  const values=[5,20,7,1,2,11].slice(0,count);
  for(const faces of [values,[...values].reverse()]){const result=check(`${count}d20${modifier<0?modifier:'+'+modifier}`,faces,20+modifier,20,'highest');assert.equal(result.selectedIndex,faces.indexOf(20));}
  check(`${count}d20+${Math.abs(modifier)}`,Array(count).fill(1),1+Math.abs(modifier),1,'highest');
 }
});
