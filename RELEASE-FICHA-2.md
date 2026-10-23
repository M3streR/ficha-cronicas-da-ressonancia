# Ficha 2.0 — publicação oficial

Interface aprovada promovida à raiz do site, mantendo os módulos originais em `js/` e os mesmos registros, identificadores e sessão oficial. A versão experimental permanece separada.

## Dados e recuperação

Antes da primeira inicialização, `official-storage-backup.js` copia os bancos locais oficiais para `cronicasRessonanciaReleaseBackups`, somente no dispositivo. Não copia tokens. A ficha reutiliza os bancos existentes e não importa personagens experimentais. Não há migração nem alteração de registros do Supabase nesta publicação.

Base anterior: commit `2c85fb7b288b0b41cfa80082c72c4d81751e52dd`, árvore `7883f617cfdcf4ab0722d8fee7fef1ad9b836475`. Para reverter a interface, restaurar essa árvore por um novo commit, sem apagar registros do navegador ou do banco.

## Portrait OBS

No painel Portrait OBS, baixar o servidor local, extrair o ZIP inteiro e executar o iniciador correspondente. Requer Node.js 20 ou superior. Manter a janela aberta e permitir acesso à rede local para o site, se solicitado pelo navegador. Copiar a URL individual para uma Fonte de Navegador de 640 × 1088. Escala sugerida: 25%. O espaço acima é transparente e reservado ao resultado; o card permanece fixo.

O serviço escuta apenas em 127.0.0.1 e autoriza os endereços oficiais explicitamente. Recursos e rolagens saem da ficha sem modificar seus dados. Não existe sincronização de localhost entre um celular e o computador do OBS. O OBS físico precisa de conferência no computador da transmissão.

## Verificação

Os testes em `release-tests/` usam dados fictícios, interceptam chamadas de produção e exercitam os dois endereços oficiais, registros antigos, backup, seis abas, recursos, dados individuais, histórico e o ZIP real do Portrait. Os testes anteriores de módulos continuam em `tests/`; os testes do motor com navegador estão em `engine/tests/`. A autorização real do Google e recuperação de senha dependem de conferência pelo titular da conta no site publicado.
