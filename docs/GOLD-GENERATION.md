# Modo Geração de Ouro — revisão local

Desenvolvido em `codex/gold-generation-mode`, a partir de
`26b763728e1ded7aa67bd281c55dcda25a7e21c8`. Publicação conjunta com o modo
dos Dois Olhos autorizada em 10/10/2026.

## Experimentar

Sirva a raiz do projeto por HTTP local e abra uma ficha. Para proteger dados
reais, prefira um perfil separado de navegador e um personagem de teste Local.

- Desktop, fora de campos editáveis: ↑ ↑ ← ↓ G E.
- Touch: cinco toques rápidos na marca do cabeçalho e um toque em Anotações.
  Anotações continua abrindo normalmente.
- Após desbloquear, o cabeçalho permite alternar a aparência sem apagar
  configurações de Aprimoramento.
- Expanda uma habilidade ou Manifestação, marque a compatibilidade e informe
  o aspecto e seu valor normal. O cálculo numérico dobra somente esse valor.
  Para efeitos complexos, informe explicitamente o resultado que dobra o aspecto.
- Nas habilidades com custo textual, informe o custo-base numérico de PN.
  Nas Manifestações utiliza-se o custo existente.
- `Usar Aprimoramento` apresenta resultado e custo-base +2 PN, com confirmação.
- A espera de uma rodada completa é controlada por jogadores e Mestre durante
  a sessão. A ficha informa a regra na confirmação, sem contadores ou bloqueios
  por rodada. Usos seguintes continuam exigindo confirmação e PN suficiente.

## Dados e compatibilidade

`goldGeneration` acompanha o personagem no Local, exportação, importação,
backups e snapshot Online. `signatureEnhancement` acompanha cada registro
personalizado. Configurações de habilidades oficiais ficam em
`goldGeneration.officialEnhancements`, usando identificadores existentes.
As habilidades oficiais continuam derivadas e não entram em `state.abilities`.

Fichas antigas sem os novos campos permanecem normais. A duplicação preserva
dados e configurações dormentes, mas começa sem desbloqueio, sem tema ativo
e preserva contadores antigos apenas como dados legados inativos.
Novas fichas não criam contadores. Exportação/importação preservam o personagem completo.

O snapshot segue fila, CAS, conflitos e autoridade de edição existentes.
Notas e foto original continuam exclusivamente Locais. Não há migrations,
alteração de schemaVersion, RPC, RLS, Storage ou infraestrutura Realtime.

## Verificação

- `node --test tests/gold-generation.test.cjs`: modelo, valores explícitos,
  custo, usos sucessivos, contadores legados, alternância, duplicação e validação.
- `node tests/gold-generation-ui.test.cjs`: teclado, touch real e sintético,
  configuração, confirmação, rollback por falha de armazenamento, favoritos,
  restauração, exportação, duplicação, aba observadora e modais.
- Cenário adicional em `tests/online-character-persistence.test.cjs`:
  snapshot, CAS, reabertura, conflito e backup com o estado completo do modo.
- Auditoria em 1920, 1366, 1280, 1279, 1024, 768, 430, 390, 360 e 320 px,
  em 100%, 110% e 125% de zoom, além de movimento reduzido.

Testes Online usam servidor simulado, sem modificar dados reais. A suíte
de CI é executada localmente. CI remoto e Preview Vercel dependem de uma
futura publicação autorizada da branch; não foram disparados nesta entrega.

Validação inicial do modo: 59 testes de módulos aprovados; 13 fluxos/auditorias da suíte
atual de CI aprovados. Sintaxe verificada em 19 arquivos JavaScript.
Capturas de revisão ficam em `tests/artifacts/gold-generation`.

Ajuste sem controle de rodadas: os 59 testes de módulos passaram novamente,
assim como os fluxos de Geração de Ouro, Encantamentos, estados críticos,
resolução de conflitos e autoridade entre abas. A validação do modo cobre
usos sucessivos, desconto único, PN insuficiente e preservação dos contadores
legados após restauração, importação, exportação e duplicação. As 30 combinações
de largura/zoom passaram sem erros de JavaScript.

Os testes históricos `guardian-paths.test.cjs` e `class-reference.test.cjs`
falham também na main intacta: seus mocks pressupõem `upsert` e não representam
a publicação atual protegida por CAS. A falha anterior foi reproduzida numa
cópia temporária do commit base; esses testes não foram alterados neste escopo.

## Limites intencionais

O resultado manual de um efeito complexo é responsabilidade do jogador/Mestre.
Nenhuma descrição é interpretada automaticamente. O segredo é uma descoberta
da interface, não uma permissão de segurança do backend. O modo não aplica
dano, cura, alvos ou duração automaticamente e não integra o Modo Crônicas.
