/* Read-only rules extracted from the official script.js. Do not hand-edit formulas. */
(function(global){'use strict';
const ATTRIBUTE_IDS = ['forca', 'vigor', 'agilidade', 'intelecto', 'presenca'];
const pericias = [
  ['Acrobacia', 'Vigor'], ['Artes', 'Presença'], ['Atletismo', 'Vigor'], ['Atualidades', 'Intelecto'],
  ['Carisma', 'Presença'], ['Ciências', 'Intelecto'], ['Combate', 'Força'],
  ['Crime', 'Agilidade'], ['Diplomacia', 'Presença'],
  ['Fortitude', 'Vigor'], ['Furtividade', 'Agilidade'], ['História', 'Intelecto'], ['Iniciativa', 'Agilidade'],
  ['Intuição', 'Presença'], ['Investigação', 'Intelecto'], ['Medicina', 'Intelecto'],
  ['Percepção', 'Presença'], ['Pilotagem', 'Agilidade'], ['Pontaria', 'Agilidade'],
  ['Profissão', 'Intelecto'], ['Reflexos', 'Agilidade'], ['Ressonância', 'Intelecto'],
  ['Sobrevivência', 'Intelecto'], ['Tática', 'Intelecto'], ['Tecnologia', 'Intelecto'],
  ['Vontade', 'Presença']
];
const legacyPericias = [
  ['Enganação', 'Presença']
];
const graus = {
  'Sem Domínio': 0,
  'Praticante': 3,
  'Experiente': 6,
  'Mestre': 9
};
const skillDegreeSteps = {
  'Sem Domínio': 0,
  'Praticante': 1,
  'Experiente': 2,
  'Mestre': 3
};
const INITIAL_PRACTITIONER_SKILLS = 6;
const classDefinitions = {
  Vanguarda: {
    pvBase: 24,
    pvPerLevel: 6,
    pnBase: 8,
    pnPerLevel: 2,
    description: 'O Vanguarda é o especialista em combate corpo a corpo. Sua função é permanecer na linha de frente, enfrentando os maiores perigos enquanto protege seus companheiros através da própria presença em combate. Essa Classe domina praticamente qualquer arma de curto alcance, desde espadas e lanças até machados, foices, manoplas, escudos e inúmeras outras possibilidades. Mais do que dominar uma arma específica, um Vanguarda aprende a transformar qualquer confronto direto em sua vantagem. Embora possua grande resistência e capacidade ofensiva, cada Vanguarda luta de maneira diferente, pois seu verdadeiro diferencial continua sendo o Nexo que carrega.',
    abilities: [
      {
        nome: 'Postura de Combate', nivel: '1', custo: '1 PN', acao: 'Livre',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: 'Até o início do seu próximo turno',
        favoriteId: 'vanguarda',
        efeito: 'Você assume uma postura de combate até o início do seu próximo turno. Escolha um dos efeitos:\n\nPostura Agressiva: recebe +2 em testes de ataque corpo a corpo;\n\nPostura Defensiva: recebe +2 na Defesa.\n\nApenas uma postura pode permanecer ativa por vez.'
      },
      {
        nome: 'Ímpeto de Batalha', nivel: '4', custo: '1 PN', acao: '',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        efeito: 'Uma vez por rodada, depois de acertar um ataque corpo a corpo, você pode gastar 1 PN para se deslocar uma distância curta sem consumir sua ação de movimento.\n\nEsse deslocamento pode ser utilizado para continuar perseguindo o alvo atingido, aproximar-se de outro inimigo, ocupar uma posição próxima mais vantajosa, proteger uma passagem ou um aliado ou reposicionar-se dentro do confronto.\n\nO movimento deve manter o personagem envolvido diretamente no combate. Ele não representa uma fuga completa, mas um avanço agressivo ou uma mudança rápida de posição.'
      },
      {
        nome: 'Tenacidade', nivel: '7', custo: '', acao: '',
        frequencia: 'Uma vez por combate', alcance: '', duracao: 'Até o final do combate',
        efeito: 'Uma vez por combate, quando seus PV forem reduzidos à metade do valor máximo ou menos, você recebe uma quantidade de PV temporários igual ao seu nível + Vigor.\n\nOs PV temporários absorvem dano antes dos seus PV normais e desaparecem ao final do combate caso ainda restem.\n\nAo ativar Tenacidade, você também pode utilizar imediatamente Postura de Combate, sem gastar PN e sem consumir uma ação. Essa ativação pode ocorrer mesmo que você já tenha utilizado Postura de Combate naquela rodada. Nesse caso, a nova postura substitui a anterior.'
      },
      {
        nome: 'Postura Perfeita', nivel: '10', custo: '4 PN', acao: 'Livre',
        frequencia: 'Uma vez por cena', alcance: '', duracao: '3 rodadas',
        efeito: 'Uma vez por cena, como uma ação livre, você pode gastar 4 PN para ativar Postura Perfeita durante 3 rodadas. Enquanto ela estiver ativa, recebe +3 na Defesa, +3 em testes de ataque corpo a corpo e +3 no dano causado por ataques corpo a corpo.\n\nPostura Perfeita pode permanecer ativa ao mesmo tempo que Postura de Combate. Seus bônus são cumulativos.\n\nA duração começa na rodada em que a habilidade é ativada e termina no final da terceira rodada do personagem.'
      }
    ],
    progression: [
      ['1', 'Postura de Combate; 2 Manifestações iniciais; 6 perícias Praticantes'],
      ['2', 'Nova Manifestação'], ['3', '+1 em um atributo; 2 avanços de domínio'],
      ['4', 'Ímpeto de Batalha'], ['5', 'Nova Manifestação'],
      ['6', '+1 em um atributo; 2 avanços de domínio; desbloqueia Experiente'],
      ['7', 'Tenacidade'], ['8', 'Nova Manifestação'],
      ['9', '+1 em um atributo; 2 avanços de domínio; desbloqueia Mestre'],
      ['10', 'Postura Perfeita'], ['11', 'Ápice do Nexo']
    ]
  },
  Atirador: {
    pvBase: 20,
    pvPerLevel: 5,
    pnBase: 10,
    pnPerLevel: 3,
    description: 'O Atirador especializou sua vida em eliminar ameaças à distância. Seja utilizando armas de fogo, arcos, bestas, facas de arremesso ou qualquer outro armamento de longo alcance, sua maior característica é a precisão. Enquanto outras Classes precisam se aproximar do perigo, o Atirador prefere analisar o campo de batalha, encontrar a melhor posição possível e atacar no momento exato. Quando combinado com um Nexo criativo, torna-se capaz de transformar projéteis comuns em técnicas extremamente perigosas e imprevisíveis.',
    abilities: [
      {
        nome: 'Mira Precisa', nivel: '1', custo: '1 PN', acao: 'Livre',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        favoriteId: 'atirador',
        efeito: 'Antes de realizar um ataque à distância, você pode rolar +1d20 no teste de ataque e manter apenas o maior resultado entre todos os dados.\n\nEsse dado adicional é temporário e não aumenta seu atributo de Agilidade.'
      },
      {
        nome: 'Reposicionamento Tático', nivel: '4', custo: '', acao: '',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        efeito: 'Uma vez por rodada, depois de realizar um ataque à distância, você pode se deslocar uma distância curta sem consumir sua ação de movimento.\n\nVocê pode utilizar esse deslocamento para alcançar uma cobertura próxima, afastar-se de um inimigo, obter uma linha de visão melhor, mudar o ângulo de seus próximos ataques ou ocupar uma posição elevada ou protegida.\n\nO ataque não precisa acertar para permitir o reposicionamento. A habilidade representa a movimentação treinada que acontece logo após o disparo ou arremesso.'
      },
      {
        nome: 'Ponto Fraco', nivel: '7', custo: '2 PN', acao: '',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        efeito: 'Uma vez por rodada, quando acertar um ataque à distância utilizando Mira Precisa, você pode gastar 2 PN para causar um dado adicional de dano da arma.\n\nO dado adicional deve ser do mesmo tipo utilizado no dano principal da arma. Por exemplo, 1d10 passa a 2d10, 2d6 passa a 3d6 e 3d4 passa a 4d4.\n\nBônus fixos de dano não são duplicados. Ponto Fraco deve ser ativado depois que o ataque acertar, mas antes da rolagem de dano.'
      },
      {
        nome: 'Olho do Predador', nivel: '10', custo: '4 PN', acao: 'Livre',
        frequencia: 'Uma vez por cena', alcance: '', duracao: '3 rodadas',
        efeito: 'Uma vez por cena, como uma ação livre, você pode gastar 4 PN para ativar Olho do Predador durante 3 rodadas. Durante esse período, você recebe +3 em testes de ataque à distância, +3 no dano de ataques à distância, pode utilizar Mira Precisa gratuitamente uma vez por rodada, ignora penalidades provocadas pela distância e ignora os benefícios de cobertura parcial utilizados pelo alvo.\n\nCobertura total ainda impede o ataque caso você não consiga enxergar ou atingir o alvo. A utilização gratuita de Mira Precisa continua respeitando o limite de uma vez por rodada.'
      }
    ],
    progression: [
      ['1', 'Mira Precisa; 2 Manifestações iniciais; 6 perícias Praticantes'],
      ['2', 'Nova Manifestação'], ['3', '+1 em um atributo; 2 avanços de domínio'],
      ['4', 'Reposicionamento Tático'], ['5', 'Nova Manifestação'],
      ['6', '+1 em um atributo; 2 avanços de domínio; desbloqueia Experiente'],
      ['7', 'Ponto Fraco'], ['8', 'Nova Manifestação'],
      ['9', '+1 em um atributo; 2 avanços de domínio; desbloqueia Mestre'],
      ['10', 'Olho do Predador'], ['11', 'Ápice do Nexo']
    ]
  },
  Arcano: {
    pvBase: 16,
    pvPerLevel: 4,
    pnBase: 16,
    pnPerLevel: 4,
    description: 'O Arcano dedica praticamente toda a sua vida ao domínio da Ressonância. Para essa Classe, o Nexo não é apenas uma ferramenta de combate, mas sua principal arma. Sua força está na criatividade e na capacidade de explorar ao máximo sua Assinatura, desenvolvendo habilidades capazes de controlar o campo de batalha, causar grandes quantidades de dano ou resolver situações das formas mais inesperadas. Apesar de possuir menor resistência física que outras Classes, um Arcano bem preparado pode mudar completamente o rumo de um combate através do uso inteligente de seu Nexo.',
    abilities: [
      {
        nome: 'Canalização Arcana', nivel: '1', custo: '1 PN adicional', acao: 'Padrão',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        favoriteId: 'arcano',
        efeito: 'Ao utilizar Canalização Arcana, escolha uma Manifestação conhecida que cause dano ou recupere Pontos de Vida e utilize-a como parte desta mesma ação.\n\nAo calcular o dano ou a cura dessa Manifestação, adicione +1 dado adicional do mesmo tipo utilizado por ela. Por exemplo, uma Manifestação que normalmente cause 2d8 de dano passa a causar 3d8, enquanto uma Manifestação que recupere 2d6 + Intelecto PV passa a recuperar 3d6 + Intelecto PV.\n\nO custo normal da Manifestação ainda deve ser pago, além do custo da Canalização Arcana. Canalização Arcana não aumenta efeitos que não utilizem dados de dano ou cura e não modifica outros efeitos da Manifestação.'
      },
      {
        nome: 'Moldagem Ressonante', nivel: '4', custo: '1 PN adicional', acao: '',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        efeito: 'Uma vez por rodada, ao utilizar uma Manifestação, você pode gastar 1 PN adicional para escolher um dos seguintes aprimoramentos: aumentar o alcance em uma categoria, aumentar a área afetada ou aumentar sua duração em 1 rodada.\n\nUma Manifestação de alcance curto poderia alcançar distância média, e uma de alcance médio poderia alcançar distância longa. O aumento de área deve ser determinado pelo mestre de acordo com a forma original da capacidade.\n\nA duração só pode ser aumentada caso a Manifestação permaneça ativa por rodadas. Efeitos instantâneos não recebem esse benefício. O aprimoramento escolhido precisa ser compatível com a Manifestação.'
      },
      {
        nome: 'Canalização Acelerada', nivel: '7', custo: '4 PN adicionais', acao: '',
        frequencia: 'Uma vez por rodada', alcance: '', duracao: '',
        efeito: 'Uma vez por rodada, você pode gastar 4 PN adicionais para utilizar como ação de movimento uma Manifestação que normalmente exigiria uma ação padrão. O custo normal da Manifestação também deve ser pago.\n\nPor exemplo, caso uma Manifestação custe 3 PN, utilizá-la através de Canalização Acelerada custará um total de 7 PN. Depois disso, você ainda conserva sua ação padrão e pode utilizá-la normalmente, inclusive para realizar outra Manifestação.\n\nManifestações que exigem ação completa, reação, condições especiais ou preparação não podem ser aceleradas, salvo quando o mestre determinar que a capacidade é compatível com essa habilidade.'
      },
      {
        nome: 'Convergência Arcana', nivel: '10', custo: 'Custos normais das Manifestações', acao: '',
        frequencia: 'Uma vez por cena', alcance: '', duracao: '',
        efeito: 'Uma vez por cena, quando utilizar uma Manifestação como ação padrão, você pode utilizar duas Manifestações diferentes como parte da mesma ação.\n\nAs duas Manifestações são resolvidas separadamente, exigem o pagamento normal de seus custos, podem possuir alvos e efeitos diferentes e seguem normalmente seus testes, alcances e limitações. Você não pode utilizar duas vezes a mesma Manifestação através de Convergência Arcana.\n\nEssa habilidade pode ser combinada com Canalização Acelerada. Nesse caso, você pode utilizar uma Manifestação como ação de movimento e outras duas através de Convergência Arcana como ação padrão, totalizando até três Manifestações no mesmo turno. Todos os custos precisam ser pagos normalmente.'
      }
    ],
    progression: [
      ['1', 'Canalização Arcana; 2 Manifestações iniciais; 6 perícias Praticantes'],
      ['2', 'Nova Manifestação'], ['3', '+1 em um atributo; 2 avanços de domínio'],
      ['4', 'Moldagem Ressonante'], ['5', 'Nova Manifestação'],
      ['6', '+1 em um atributo; 2 avanços de domínio; desbloqueia Experiente'],
      ['7', 'Canalização Acelerada'], ['8', 'Nova Manifestação'],
      ['9', '+1 em um atributo; 2 avanços de domínio; desbloqueia Mestre'],
      ['10', 'Convergência Arcana'], ['11', 'Ápice do Nexo']
    ]
  },
  Guardião: {
    pvBase: 22,
    pvPerLevel: 5,
    pnBase: 12,
    pnPerLevel: 3,
    legacy: true,
    ability: {
      nome: 'Pulso Restaurador',
      nivel: '1',
      custo: '1 PN',
      acao: 'Padrão',
      frequencia: 'Uma vez por rodada',
      alcance: 'Curto',
      duracao: '',
      efeito: 'Escolha você ou uma criatura em alcance curto que possa enxergar. O alvo recupera 2d4 + Intelecto Pontos de Vida.\n\nEssa habilidade não pode ser utilizada em personagens mortos.'
    }
  },
  'Guardião Bastião': {
    pvBase: 22,
    pvPerLevel: 5,
    pnBase: 12,
    pnPerLevel: 3,
    description: 'O Guardião Bastião acredita que proteger também é uma forma de lutar. Feito para ocupar a linha de frente, ele transforma sua própria presença em uma barreira entre o perigo e seus aliados, resistindo a ataques, impedindo avanços e segurando posições que outros não conseguiriam manter. Um Bastião não luta apenas para sobreviver, mas para garantir que aqueles ao seu lado continuem de pé. Ainda assim, proteção não significa passividade: quando chega a hora de avançar, ele sabe usar sua força para pressionar o inimigo e abrir espaço para a equipe.',
    abilities: [
      {
        nome: 'Guarda Ressonante', nivel: '1', custo: '1 PN', acao: 'Livre',
        frequencia: 'Uma vez por rodada', alcance: 'Curto', duracao: 'Até o início do seu próximo turno',
        efeito: 'Como uma Ação Livre, uma vez por rodada, você pode gastar 1 PN e escolher você ou um aliado em alcance curto que possa perceber. O alvo recebe +2 de Defesa até o início do seu próximo turno.\n\nVocê só pode manter uma criatura sob o efeito de Guarda Ressonante por vez. Utilizar essa habilidade novamente encerra o efeito anterior.'
      },
      {
        nome: 'Intervenção Ressonante', nivel: '4', custo: '2 PN', acao: 'Reação',
        frequencia: 'Uma vez por rodada', alcance: 'Curto', duracao: '',
        efeito: 'Quando você ou um aliado em alcance curto sofrer dano, utilize sua Reação depois que o dano for anunciado, mas antes que seja aplicado aos PV, para reduzi-lo em 1d8 + Intelecto.\n\nA redução pode diminuir o dano até 0, mas nunca transformá-lo em cura. Você precisa perceber o aliado ou compreender que ele está sendo atacado.'
      },
      {
        nome: 'Guarda Inabalável', nivel: '7', custo: '', acao: '',
        frequencia: 'Ao usar Intervenção Ressonante', alcance: 'Curto', duracao: 'Até o início do seu próximo turno',
        efeito: 'Sempre que utilizar Intervenção Ressonante em uma criatura, ela também recebe +2 de Defesa até o início do seu próximo turno.\n\nSe a Intervenção reduzir completamente o dano a 0, o alvo não pode ser empurrado, derrubado ou deslocado contra a própria vontade pelo efeito daquele ataque.'
      },
      {
        nome: 'Fortaleza Ressonante', nivel: '10', custo: '5 PN', acao: 'Livre',
        frequencia: 'Uma vez por cena', alcance: 'Curto', duracao: '3 rodadas',
        efeito: 'Você cria uma área que acompanha seus movimentos. Você e seus aliados em alcance curto recebem +3 de Defesa, redução de 2 de dano contra todas as fontes e resistência contra efeitos que tentem empurrar, derrubar ou deslocar.\n\nUma vez durante a duração, quando você ou um aliado em alcance curto fosse reduzido a 0 PV, utilize sua Reação para fazer com que permaneça com 1 PV.'
      }
    ],
    progression: [
      ['1', 'Guarda Ressonante; 2 Manifestações iniciais; 6 perícias Praticantes'],
      ['2', 'Nova Manifestação'], ['3', '+1 em um atributo; 2 avanços de domínio'],
      ['4', 'Intervenção Ressonante'], ['5', 'Nova Manifestação'],
      ['6', '+1 em um atributo; 2 avanços de domínio; desbloqueia Experiente'],
      ['7', 'Guarda Inabalável'], ['8', 'Nova Manifestação'],
      ['9', '+1 em um atributo; 2 avanços de domínio; desbloqueia Mestre'],
      ['10', 'Fortaleza Ressonante'], ['11', 'Ápice do Nexo']
    ]
  },
  'Guardião Regente': {
    pvBase: 22,
    pvPerLevel: 5,
    pnBase: 12,
    pnPerLevel: 3,
    description: 'O Guardião Regente acredita que proteger um grupo também significa garantir que cada aliado consiga lutar em sua melhor condição. Especialista em suporte, restauração e controle do ritmo de combate, utiliza seu Nexo para fortalecer aliados, enfraquecer inimigos e impedir que pequenos problemas se transformem em derrotas. Sua função não é apenas curar: um Regente experiente observa o campo, identifica quem precisa de ajuda e interfere no momento certo.',
    abilities: [
      {
        nome: 'Pulso Restaurador', nivel: '1', custo: '1 PN', acao: 'Padrão',
        frequencia: 'Uma vez por rodada', alcance: 'Curto', duracao: '',
        efeito: 'Escolha você ou uma criatura em alcance curto que possa enxergar. O alvo recupera 2d4 + Intelecto Pontos de Vida.\n\nPulso Restaurador não pode recuperar personagens mortos.'
      },
      {
        nome: 'Ordem Ressonante', nivel: '4', custo: '2 PN', acao: 'Padrão',
        frequencia: 'Uma vez por rodada', alcance: 'Curto', duracao: 'Até o início do seu próximo turno',
        efeito: 'Escolha uma criatura em alcance curto e um efeito.\n\nFortalecer: um aliado recebe +1d20 no próximo Teste que realizar até o início do seu próximo turno.\n\nEnfraquecer: um inimigo realiza um Teste de Vontade contra seu Limiar de Ressonância. Se falhar, recebe -1d20 no próximo Teste que realizar até o início do seu próximo turno.'
      },
      {
        nome: 'Regência Compartilhada', nivel: '7', custo: '+1 PN', acao: '',
        frequencia: 'Ao usar Ordem Ressonante ou Pulso Restaurador', alcance: 'Curto', duracao: '',
        efeito: 'Ao utilizar Ordem Ressonante, gaste 1 PN adicional para escolher uma segunda criatura em alcance curto. Cada criatura resolve seus efeitos e Testes separadamente.\n\nAo utilizar Pulso Restaurador, gaste 1 PN adicional para escolher uma segunda criatura em alcance curto. Ela recupera metade da cura total gerada, incluindo Intelecto e outros bônus, arredondada para baixo.'
      },
      {
        nome: 'Campo de Regência', nivel: '10', custo: '5 PN', acao: 'Livre',
        frequencia: 'Uma vez por cena', alcance: 'Curto', duracao: '3 rodadas',
        efeito: 'A área acompanha seus movimentos. Aliados em alcance curto recebem +1d20 no primeiro Teste de cada rodada e +1d6 nas curas realizadas por habilidades do Guardião Regente.\n\nAntes do primeiro Teste de cada rodada, inimigos em alcance curto realizam Vontade contra seu Limiar de Ressonância; em caso de falha, recebem -1d20 nesse Teste. Uma vez durante a duração, remova uma Condição negativa de um aliado em alcance curto sem gastar ação adicional.'
      }
    ],
    progression: [
      ['1', 'Pulso Restaurador; 2 Manifestações iniciais; 6 perícias Praticantes'],
      ['2', 'Nova Manifestação'], ['3', '+1 em um atributo; 2 avanços de domínio'],
      ['4', 'Ordem Ressonante'], ['5', 'Nova Manifestação'],
      ['6', '+1 em um atributo; 2 avanços de domínio; desbloqueia Experiente'],
      ['7', 'Regência Compartilhada'], ['8', 'Nova Manifestação'],
      ['9', '+1 em um atributo; 2 avanços de domínio; desbloqueia Mestre'],
      ['10', 'Campo de Regência'], ['11', 'Ápice do Nexo']
    ]
  }
};
function integerBetween(value, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}
function calculateResonanceThreshold(level, intellect) {
  const safeLevel = integerBetween(level, 1, 11);
  const safeIntellect = integerBetween(intellect, 1, safeLevel === 11 ? 6 : 5);
  return 15 + safeIntellect + Math.floor(safeLevel / 2);
}
function getSkillAdvancesForLevel(level) {
  const safeLevel = integerBetween(level, 1, 11);
  return (safeLevel >= 3 ? 2 : 0) + (safeLevel >= 6 ? 2 : 0) + (safeLevel >= 9 ? 2 : 0);
}
function getMaximumSkillDegreeStep(level) {
  const safeLevel = integerBetween(level, 1, 11);
  if (safeLevel >= 9) return skillDegreeSteps.Mestre;
  if (safeLevel >= 6) return skillDegreeSteps.Experiente;
  return skillDegreeSteps.Praticante;
}
function analyzeSkillDistribution(
  degrees = getOfficialSkillDegrees(),
  level = integerBetween(document.getElementById('nivel')?.value, 1, 11)
) {
  const safeLevel = integerBetween(level, 1, 11);
  const entries = pericias.map(([name]) => ({
    name,
    degree: Object.prototype.hasOwnProperty.call(skillDegreeSteps, degrees[name])
      ? degrees[name]
      : 'Sem Domínio',
    step: skillDegreeSteps[degrees[name]] || 0
  }));
  const trainedCount = entries.filter(entry => entry.step >= skillDegreeSteps.Praticante).length;
  const initialUsed = Math.min(trainedCount, INITIAL_PRACTITIONER_SKILLS);
  const advancesEarned = getSkillAdvancesForLevel(safeLevel);
  const advancesUsed = (
    Math.max(0, trainedCount - INITIAL_PRACTITIONER_SKILLS)
    + entries.reduce((total, entry) => total + Math.max(0, entry.step - skillDegreeSteps.Praticante), 0)
  );
  const lockedExperienced = safeLevel < 6
    ? entries.filter(entry => entry.step === skillDegreeSteps.Experiente).map(entry => entry.name)
    : [];
  const lockedMaster = safeLevel < 9
    ? entries.filter(entry => entry.step === skillDegreeSteps.Mestre).map(entry => entry.name)
    : [];
  const excessAdvances = Math.max(0, advancesUsed - advancesEarned);

  return {
    level: safeLevel,
    trainedCount,
    initialUsed,
    initialRemaining: Math.max(0, INITIAL_PRACTITIONER_SKILLS - initialUsed),
    advancesEarned,
    advancesUsed,
    advancesAvailable: Math.max(0, advancesEarned - advancesUsed),
    excessAdvances,
    lockedExperienced,
    lockedMaster,
    incompatible: excessAdvances > 0 || lockedExperienced.length > 0 || lockedMaster.length > 0
  };
}
function computeClassMaximums(snapshot) {
  const definition = classDefinitions[snapshot.classe];
  if (!definition) return null;
  const additionalLevels = Math.max(0, snapshot.nivel - 1);
  return {
    pvMax: definition.pvBase + snapshot.vigor + (definition.pvPerLevel * additionalLevels),
    pnMax: definition.pnBase + snapshot.intelecto + (definition.pnPerLevel * additionalLevels),
    psMax: 20 + (2 * additionalLevels)
  };
}
function getAttributeLabel(id) {
  const labels = {
    forca: 'Força',
    vigor: 'Vigor',
    agilidade: 'Agilidade',
    intelecto: 'Intelecto',
    presenca: 'Presença'
  };
  return labels[id] || id;
}
function canChangeSkill(state,name,nextDegree){
 const rowFor=name=>({dataset:{skill:name,skillLegacy:name==='Enganação'?'true':'false'},querySelector:()=>({value:state.skills[name]||'Sem Domínio',dataset:{previousDegree:state.skills[name]||'Sem Domínio'}})});
 const document={getElementById:()=>({value:state.fields.nivel}),querySelectorAll:()=>pericias.map(([name])=>rowFor(name))};
 function getOfficialSkillDegrees() {
  return Object.fromEntries([...document.querySelectorAll('#listaPericias .skill-row')].map(row => [
    row.dataset.skill,
    row.querySelector('select').value
  ]));
}
 function validateSkillDegreeChange(row, nextDegree) {
  const select = row.querySelector('select');
  const previousDegree = select.dataset.previousDegree || select.value || 'Sem Domínio';
  const previousStep = skillDegreeSteps[previousDegree] || 0;
  const nextStep = skillDegreeSteps[nextDegree];
  if (nextStep === undefined) return { allowed: false, message: 'Escolha um grau de domínio reconhecido.' };

  if (row.dataset.skillLegacy === 'true') {
    return nextStep <= previousStep
      ? { allowed: true }
      : { allowed: false, message: `${row.dataset.skill} é um dado legado e não pode receber novos avanços.` };
  }
  if (nextStep <= previousStep) return { allowed: true };
  if (nextStep - previousStep > 1) {
    return { allowed: false, message: 'Cada avanço eleva a perícia em apenas um grau.' };
  }

  const level = integerBetween(document.getElementById('nivel')?.value, 1, 11);
  if (nextStep > getMaximumSkillDegreeStep(level)) {
    const requiredLevel = nextStep === skillDegreeSteps.Mestre ? 9 : 6;
    return { allowed: false, message: `${nextDegree} fica disponível somente a partir do nível ${requiredLevel}.` };
  }

  const currentDegrees = getOfficialSkillDegrees();
  currentDegrees[row.dataset.skill] = previousDegree;
  const current = analyzeSkillDistribution(currentDegrees, level);
  if (current.incompatible) {
    return { allowed: false, message: 'Corrija primeiro a distribuição incompatível antes de aplicar novos avanços.' };
  }

  const candidateDegrees = { ...currentDegrees };
  candidateDegrees[row.dataset.skill] = nextDegree;
  const candidate = analyzeSkillDistribution(candidateDegrees, level);
  if (candidate.advancesUsed > candidate.advancesEarned) {
    return {
      allowed: false,
      message: level < 3 && candidate.trainedCount > INITIAL_PRACTITIONER_SKILLS
        ? 'No nível 1, apenas 6 perícias podem começar como Praticante.'
        : 'Não há avanços de domínio disponíveis para esta melhoria.'
    };
  }
  return { allowed: true };
}
 return validateSkillDegreeChange(rowFor(name),nextDegree);
}
global.FichaV2Rules=Object.freeze({ATTRIBUTE_IDS,pericias,legacyPericias,graus,skillDegreeSteps,classDefinitions,integerBetween,calculateResonanceThreshold,getSkillAdvancesForLevel,getMaximumSkillDegreeStep,analyzeSkillDistribution,computeClassMaximums,getAttributeLabel,canChangeSkill});
})(typeof window==='undefined'?globalThis:window);
