# Crônicas da Ressonância — Ficha Digital v1.1.2 Pré-Alpha

Compilação 1.1.2: inclui Acrobacia e Fortitude, ambas associadas a Vigor.

Primeira versão pública de testes da ficha digital de **Crônicas da Ressonância**.

## Recursos atuais

- Funciona no computador e no celular.
- Salvamento automático no navegador.
- Exportação e importação da ficha em JSON.
- Foto do personagem.
- Controle de PV, PN, PS, Defesa e PV temporários.
- Ajustes rápidos de recursos.
- Distribuição inicial de atributos: todos começam em 1 e possuem 1 ponto adicional no nível 1.
- Cálculo automático de PV, PN e PS máximos para:
  - Vanguarda
  - Atirador
  - Arcano
  - Guardião
- Subir de nível altera apenas os valores máximos; os valores atuais são preservados.
- Habilidade inicial automática ao selecionar a classe:
  - Vanguarda: Postura de Combate
  - Atirador: Mira Precisa
  - Arcano: Canalização Arcana
  - Guardião: Pulso Restaurador
- Equipamentos, habilidades de classe e Manifestações editáveis.

## Publicação no GitHub Pages

Os arquivos abaixo devem ficar diretamente na raiz do repositório:

- `index.html`
- `style.css`
- `script.js`
- `README.md`

Depois, em **Settings → Pages**, selecione a branch `main` e a pasta `/(root)`.

## Versão portátil

O arquivo `ficha-cronicas-v0.3-pre-alpha-portatil.html` contém HTML, CSS e JavaScript juntos. Ele pode ser enviado diretamente para testes locais no computador ou no celular.

## Armazenamento de personagens em preparação

A versão 0.4 inclui a camada interna inicial do futuro gerenciador de múltiplos personagens. Ela usa um índice versionado e uma chave separada para cada ficha:

- `cronicasRessonanciaCharacterManagerV4`
- `cronicasRessonanciaCharacterV4:<id>`

O índice guarda somente nome, nível, data de atualização e uma miniatura JPEG reduzida da foto. A imagem original permanece apenas dentro da ficha individual.

Ao encontrar uma ficha na chave `cronicasRessonanciaFichaV3PreAlpha`, a aplicação valida e copia o personagem para a estrutura V4. O registro individual é gravado e verificado antes da conclusão do índice. A chave V3 original permanece intacta como cópia de recuperação.

Depois da migração, o salvamento automático passa a gravar o registro V4 individual que estiver aberto, enquanto a chave V3 permanece preservada como cópia de recuperação. A lógica interna conclui salvamentos pendentes antes de abrir ou fechar outro registro. A criação de novos personagens ainda não está disponível.

Ao abrir a aplicação, o gerenciador apresenta os registros V4 em uma galeria de retratos. Cada cartão mostra somente miniatura, nome e nível e abre sua ficha individual. A ação “Voltar aos personagens” conclui o salvamento, atualiza o resumo e retorna à galeria. “Criar novo personagem” gera e verifica uma ficha V4 vazia antes de abri-la. A importação pelo menu valida arquivos 0.3, mostra uma prévia e adiciona o conteúdo como outro registro, sem substituir personagens existentes.

O botão de opções de cada cartão permite exportar seu JSON 0.3 sem abrir a ficha ou iniciar uma exclusão individual protegida por confirmação. A exclusão pode preparar um backup antes da remoção ou exigir uma confirmação adicional quando realizada sem backup. Dentro da ficha, “Excluir personagem” utiliza o mesmo fluxo e retorna ao menu após a conclusão.

## Aviso

Esta é uma versão **Pré-Alpha**. Recursos, regras, textos e aparência ainda podem mudar após os testes com jogadores.
