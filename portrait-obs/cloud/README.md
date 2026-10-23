# Portrait online — jogadores em computadores diferentes

Disponível por padrão para contas conectadas, tanto com personagens anteriores quanto novos. Abra o personagem, entre na conta e use **Portrait OBS → Copiar URL**. O endereço HTTPS pode ser usado pelo mestre em outro computador. O jogador mantém a ficha aberta para enviar alterações. Nenhum servidor local precisa ser instalado pelos jogadores.

No OBS: Fonte de Navegador, 640 × 1088, escala sugerida 25%. O desenho, a transparência e a placa de resultados são os mesmos do Portrait local. O endereço é estável. Uma atualização inicial do navegador e nova cópia da URL são necessárias para substituir os endereços antigos `127.0.0.1`, que são locais ao computador.

O link permite somente visualizar nome, retrato, PV/PN/PS e rolagens reais. Não transmite anotações, inventário, senha nem a ficha completa. Quem receber o link poderá visualizar esse Portrait; use **Renovar link** para invalidar o endereço anterior. Isso não exclui personagens nem modifica seus recursos.

## Implementação

`cloud-sync.js` publica a saída de `sync.observe/roll`, usando a sessão já existente e RPCs autenticadas. As tabelas próprias em `portrait_private` têm RLS com acesso direto bloqueado. Funções privadas validam o proprietário; a visualização verifica uma chave aleatória de 64 dígitos hexadecimais. As funções públicas são invocadoras sem privilégios próprios. Não há permissões novas sobre personagens ou Crônicas.

A URL carrega a chave no fragmento, com política de referência desabilitada. `remote.html` reutiliza `overlay.js` e `overlay.css`. O observador consulta atualizações incrementais a cada aproximadamente um segundo, com recuo em falhas. Imagens são enviadas somente quando mudam, em cópia dimensionada; a foto original da ficha é preservada. Os cálculos e sorteios continuam exclusivamente no rolador original. IDs de eventos evitam duplicação; abertura e reconexão pulam rolagens antigas. Eventos são removidos após dez minutos durante a próxima publicação de rolagem do mesmo personagem.

O modo local anterior continua disponível e os endereços locais existentes continuam funcionando no computador da transmissão. Sua sincronização permanece independente da saída online.

## Verificação

`real.test.cjs` utiliza duas contas descartáveis do projeto de testes e um observador sem login em contexto separado, com localhost bloqueado. Verifica recursos, foto, exclusão de notas privadas, maior de 3d20, sorteio único, rolagens consecutivas, duplicação, isolamento entre proprietários, retomada, falha de envio sem bloquear salvamento e renovação de link. Nenhum personagem real é usado. OBS físico não foi utilizado nesse ensaio.
