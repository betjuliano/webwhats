# Plano de Ação - Projeto WebWhats

Este documento delineia as próximas etapas e funcionalidades a serem implementadas no projeto WebWhats.

---

### **Nível 1: Funcionalidades Essenciais (Concluído)**

- **1.1: Integração com Evolution API**: Conectar o sistema à API do WhatsApp. (Status: ✅ **Concluído**)
- **1.2: Recebimento e Armazenamento de Mensagens**: Salvar todas as mensagens recebidas no banco de dados. (Status: ✅ **Concluído**)
- **1.3: Serviço de Fila (Bull)**: Implementar uma fila para processamento assíncrono de tarefas pesadas. (Status: ✅ **Concluído**)
- **1.4: Processamento Básico de Mídia**: Lidar com o download e armazenamento inicial de arquivos de mídia. (Status: ✅ **Concluído**)
- **1.5: Envio de Mensagens via API**: Permitir o envio de mensagens de texto através de um endpoint. (Status: ✅ **Concluído**)

---

### **Nível 2: Inteligência e Resumos (Em Andamento)**

- **2.1: Geração de Resumos Automáticos para Grupos**:
  - **O que fazer**: Criar um serviço (`cronService`) que roda periodicamente e gera resumos de grupos com alta atividade.
  - **Status**: ✅ **Implementado**.

- **2.2: Endpoint para Resumo de Grupo Sob Demanda**:
  - **O que fazer**: Criar uma rota na API (`POST /api/summaries/request`) para solicitar o resumo de um grupo específico.
  - **Status**: ✅ **Concluído e Verificado**.

---

### **Nível 3: Inteligência, Automação e Centralização de Comandos**

#### **Princípio Central: Redirecionamento de Respostas para o Administrador**

*   **Regra Global**: Todas as respostas de comandos iniciados com `/` e os resultados de processamentos automáticos serão sempre redirecionados para a conta de administrador do sistema, definida pela variável de ambiente `ADMIN_CHAT_ID`.

---

#### **3.1: Reconfiguração do Processamento Automático de Mídia**

*   **Objetivo**: Modificar os serviços existentes para que os resultados da transcrição de áudio, descrição de imagens, etc., sejam enviados **para a conta do administrador**.
*   **O que fazer**: Alterar `queueService` para que os processadores de jobs de mídia enviem a resposta final para o `ADMIN_CHAT_ID`, incluindo o `chatId` de origem para contexto.
*   **Onde**: `src/services/queueService.js`, `.env`.
*   **Status**: ✅ **Implementado**.

---

#### **3.2. Comando `/historico` para Resumo de Conversas**

*   **Objetivo**: Criar o comando `/historico` que, ao ser acionado, gera um resumo da conversa e envia o resultado para o administrador.
*   **Onde**: `src/services/whatsappService.js`, `src/services/conversationAnalysisService.js` (Novo).
*   **Status**: ✅ **Implementado**.

---

#### **3.3. Script para Geração de Embeddings da Base de Conhecimento (Execução Local)**

*   **Objetivo**: Criar um script local e incremental para gerar/atualizar arquivos de embeddings, usando uma estrutura de pastas para gerenciar o estado do processamento.
*   **O que fazer**:
    1.  **Estrutura de Pastas**: Cada categoria (ex: `conhecimento/curso/`) contém uma subpasta `prontos/`. Arquivos a serem processados são colocados na raiz da categoria (em `curso/`).
    2.  **Lógica do Script (`npm run knowledge:build`)**:
        a.  O script compara os arquivos em `curso/prontos/` com o `curso.json` existente e remove os dados de arquivos que foram deletados.
        b.  Processa **apenas os novos arquivos** (`.pdf`, `.docx`, etc.) encontrados na raiz `curso/`.
        c.  Após o processamento bem-sucedido, **move os novos arquivos** para a subpasta `curso/prontos/`.
        d.  Salva o novo `curso.json` atualizado, contendo os dados antigos sincronizados mais os novos.
*   **Onde**: `scripts/generate-embeddings.js`.
*   **Status**: ✅ **Implementado**.

---

#### **3.4. Comandos de Busca na Base de Conhecimento (`/curso`, `/projetos`, etc.)**

*   **Objetivo**: Criar comandos para buscar na base de conhecimento isolada de cada categoria e enviar os resultados para o administrador.
*   **O que fazer**: Detectar comandos como `/curso <pergunta>` no `messageService`. Chamar o `knowledgeSearchService`, que agora carrega dinamicamente apenas a base de conhecimento relevante (ex: `curso.json`) sob demanda. O serviço transforma a pergunta em vetor, busca os textos mais similares e envia os resultados formatados para o `ADMIN_CHAT_ID`.
*   **Onde**: `src/services/messageService.js` e `src/services/knowledgeSearchService.js`.
*   **Status**: ✅ **Implementado**.

---

#### **3.5. Comando `/base` para Gerenciamento de Conhecimento Específico do Contato**

*   **Objetivo**: Criar um comando `/base` com dupla função em conversas individuais: criação e recuperação de conhecimento específico.
*   **O que fazer**:
    1.  No `messageService`, detectar o comando `/base` de um `userChatId`.
    2.  Verificar se o arquivo `conhecimento/orientacoes/${userChatId}.txt` já existe.
    3.  **Se existir**: Ler o conteúdo do arquivo e enviar para o `ADMIN_CHAT_ID`.
    4.  **Se não existir**: Buscar o histórico de mensagens da última hora no banco de dados, salvar o histórico no arquivo, e notificar o `ADMIN_CHAT_ID` sobre a criação e a necessidade de re-indexar o conhecimento com `npm run knowledge:build`.
*   **Onde**: `src/services/messageService.js`, com uso dos módulos `fs` e `path`.
*   **Status**: ✅ **Implementado**.

---

#### **3.6. Comando `/resumo` para Grupos**

*   **Objetivo**: Criar o comando `/resumo` para grupos, que gera um resumo sob demanda e envia o resultado para o administrador.
*   **O que fazer**: Detectar o comando `/resumo` no `whatsappService`, acionar o `summaryService.requestSummary` e modificar o job no `queueService` para enviar o resultado para o `ADMIN_CHAT_ID`.
*   **Onde**: `src/services/whatsappService.js`, `src/services/queueService.js`.
*   **Status**: ✅ **Implementado**.

## 4. Próximos Passos Recomendados

Esta seção foi atualizada para incluir as novas funcionalidades solicitadas.

### Nível 1: Lógica de Negócio Essencial

1.  **Ajustar Transcrição de Áudio para Chats Individuais**:
    - **O que fazer**: Garantir que a transcrição de áudio seja acionada **apenas** para mensagens recebidas em chats individuais (ou seja, quando `message.isGroup` for `false`).
    - **Onde**: A lógica foi implementada no `messageService.js` (`processIndividualMessage`). Esta abordagem é mais eficiente, pois evita o processamento de mensagens duplicadas antes de enfileirar a transcrição, economizando recursos.
    - **Status**: ✅ **Concluído**.

2.  **Criar Endpoint para Resumo de Grupo Sob Demanda**:
    - **O que fazer**: Criar uma rota na API (ex: `POST /api/summaries/request`) que um usuário possa chamar para solicitar o resumo de um grupo específico. A rota deve receber o `chatId` do grupo e o número do solicitante.
    - **Onde**: A rota foi identificada em `src/routes/summaries.js`, a lógica de serviço em `src/services/summaryService.js` e o processamento da fila em `src/services/queueService.js`.
    - **Detalhes da Implementação**: A funcionalidade foi revisada e ajustada. Agora, quando a rota é acionada:
        1. O `summaryService` valida se o chat é um grupo e se há mensagens suficientes.
        2. Um job é adicionado à fila, contendo o `chatId` do grupo e o `requesterId` (o administrador que solicitou).
        3. O `queueService`, ao processar o job, gera o resumo e o envia em uma mensagem privada diretamente para o `requesterId`.
        4. Foi garantido que o resumo **nunca** é enviado de volta para o grupo, apenas para o solicitante ou, em caso de jobs automáticos, para o `ADMIN_CHAT_ID` global.
    - **Status**: ✅ **Concluído e Verificado**.


### **Nível 4: Modos Interativos e Estado de Conversa**

#### **4.1. Modo de Suporte ao Aluno com Comando de Ativação/Desativação**

*   **Objetivo**: Criar um "modo de suporte" que pode ser ativado em conversas individuais. Enquanto estiver ativo, o sistema usará a base de conhecimento da categoria `curso` para responder automaticamente às perguntas do usuário, até que o modo seja desativado.

*   **O que fazer**:
    1.  **Gerenciamento de Estado**: No `messageService.js`, criar uma variável em memória (ex: `const activeSupportChats = new Map();`) para rastrear quais chats estão com o modo de suporte ativo e qual a categoria de conhecimento associada (ex: `activeSupportChats.set('chatId123', 'curso')`).
    2.  **Comando de Ativação (`//apoioaluno`)**:
        *   No `messageService`, detectar mensagens que começam com `//apoioaluno`.
        *   Ao receber o comando, adicionar o `chatId` e a categoria `curso` ao `activeSupportChats`.
        *   Enviar uma mensagem de confirmação para o chat, como: "✅ *Modo de Apoio ao Aluno ativado. Faça suas perguntas sobre o curso. Para sair, digite 'obrigado'.*"
    3.  **Lógica de Resposta Automática**:
        *   No início do `processIndividualMessage`, verificar se o `chatId` da mensagem está no `activeSupportChats`.
        *   Se estiver, a mensagem do usuário será tratada como uma pergunta a ser respondida:
            a.  Chamar o `knowledgeSearchService.search()` com a pergunta do usuário e a categoria armazenada (`curso`).
            b.  **Síntese com IA**: Pegar os resultados da busca e enviá-los ao `aiService` junto com a pergunta original, usando um prompt específico como: *"Você é um tutor. Use as informações de contexto abaixo para responder à pergunta do aluno de forma clara e objetiva. Se o contexto não for suficiente, informe que não encontrou a resposta."*
            c.  Enviar a resposta sintetizada pela IA de volta para o usuário.
    4.  **Comando de Desativação (`obrigado`)**:
        *   Detectar se a mensagem recebida, em minúsculas e sem espaços, é exatamente "obrigado".
        *   Se for e o chat estiver no `activeSupportChats`, remover o `chatId` do mapa.
        *   Enviar uma mensagem de confirmação, como: "👍 *Modo de Apoio finalizado. Até a próxima!*"

*   **Onde**:
    *   `src/services/messageService.js`: Para o gerenciamento de estado (o `Map`), detecção dos comandos de ativação/desativação e orquestração da busca e resposta.
    *   Serão utilizados os já existentes `knowledgeSearchService` e `aiService`.

*   **Status**: ✅ **Concluído**.

---

### **Nível 5: Revisão e Melhoria Contínua**

Esta seção detalha os ajustes e melhorias identificados durante a revisão do projeto para aumentar a segurança, a manutenibilidade e a robustez do sistema.

#### **5.1. Implementar Verificação de Assinatura do Webhook (Segurança)**

*   **Objetivo**: Proteger o endpoint de webhook contra requisições não autorizadas, garantindo que apenas a Evolution API possa enviar eventos.
*   **Observação**: A implementação da verificação por assinatura HMAC-SHA256 foi tentada, conforme as melhores práticas de segurança. No entanto, descobriu-se que a instância da Evolution API utilizada (`https://evolution.iaprojetos.com.br/`) não oferece um campo para configurar um "segredo de webhook". Sem essa contraparte, a verificação do lado do servidor falharia para todas as requisições. A funcionalidade foi, portanto, removida para garantir a compatibilidade e o recebimento dos webhooks.
*   **Risco Atual**: Sem a verificação, qualquer pessoa com a URL do webhook pode enviar dados falsos, causando processamento indevido e representando um risco de segurança. A segurança agora depende de a URL do webhook não ser exposta.
*   **O que foi feito**:
    1.  O endpoint do webhook foi configurado e validado em `https://webwhats.iaprojetos.com.br/webhook/evolution`.
    2.  O código para a verificação de assinatura foi implementado, mas posteriormente removido devido à limitação da plataforma.
*   **Onde**: A configuração foi realizada na plataforma da Evolution API. As alterações de código foram feitas em `src/index.js` (para expor `req.rawBody`), `src/middleware/webhookAuth.js` (criado e depois inutilizado) e `src/routes/webhook.js`.
*   **Status**: ✅ **Implementado (com observação)**.

#### **5.2. Centralizar Lógica de Transformação de Mensagens (Refatoração)**

*   **Objetivo**: Eliminar a duplicação de código e o risco de inconsistências ao centralizar a lógica que converte o payload da Evolution API para o formato interno do sistema.
*   **Problema Atual**: A lógica de extração de dados da mensagem está duplicada, existindo tanto no `webhookService.js` quanto (de forma mais completa) no `messageService.js`. Isso é redundante e pode levar a erros.
*   **O que fazer**:
    1.  Simplificar o `webhookService.js`: Remover a lógica de transformação manual do payload. Sua única responsabilidade será verificar o tipo de evento (`messages.upsert`) e passar o payload da mensagem (`payload.data` e `payload.instance`) diretamente para o `messageService`.
    2.  Ajustar o `messageService.js`: Garantir que o método `processIncomingMessage` espere o payload bruto da Evolution API e o passe para o `extractMessageData`, que agora centraliza toda a lógica de extração. Adicionar uma coluna `instance_id` na tabela `messages` para rastrear a origem da mensagem.
*   **Onde**:
    *   `src/services/webhookService.js`
    *   `src/services/messageService.js`
    *   `docker/postgres/init.sql`
*   **Status**: ✅ **Implementado e Verificado**.

#### **5.3. Aprimorar o Encerramento "Graceful Shutdown" (Robustez)**

*   **Objetivo**: Garantir que, ao encerrar a aplicação, todas as requisições HTTP em andamento sejam concluídas antes de o processo ser finalizado.
*   **Problema Atual**: O `gracefulShutdown` fecha as conexões com o banco de dados e o Redis, mas não aguarda o servidor Express parar de aceitar novas conexões e terminar as existentes.
*   **O que fazer**:
    1.  No `src/index.js`, armazenar a instância do servidor retornada por `app.listen()` em uma variável (ex: `const server = app.listen(...)`).
    2.  Dentro da função `gracefulShutdown`, chamar `server.close()`. Este método impede que o servidor aceite novas conexões e executa um callback quando todas as conexões existentes forem encerradas.
    3.  Mover o fechamento do banco de dados e do Redis para dentro do callback do `server.close()`, garantindo que eles só sejam desconectados após o fim das requisições.
*   **Onde**: `src/index.js`.
*   **Status**: ✅ **Implementado**.

---

### **Nível 6: Deploy e Orquestração com Docker na VPS**

Esta seção descreve o processo passo a passo para implantar a aplicação em uma Virtual Private Server (VPS) usando Docker, Portainer e Traefik, garantindo um ambiente gerenciável e escalável.

#### **6.1. Verificação do Ambiente na VPS**

*   **Objetivo**: Garantir que o ambiente do servidor está pronto para a nova aplicação.
*   **O que foi feito**:
    1.  **Verificação de Ferramentas**: Confirmamos que o Docker (`v28.3.0`) e o Docker Compose (`v2.37.3`) estão instalados e operacionais na VPS.
    2.  **Verificação de Portas**: Checamos as portas em uso e validamos que as portas `80` e `443` são gerenciadas pelo `docker-proxy`, indicando que o Traefik (ou outro proxy reverso em contêiner) já está ativo e pronto para receber o tráfego da nossa aplicação.
    3.  **Verificação de Rede**: Listamos as redes do Docker e confirmamos que a rede externa `traefik_public` existe e é do tipo `overlay swarm`, pronta para ser utilizada pelo nosso `docker-compose.yml`.
*   **Conclusão**: O ambiente da VPS está corretamente configurado e pronto para o deploy.
*   **Status**: ✅ **Concluído**.

#### **6.2. Preparação do Projeto para Deploy**

*   **Objetivo**: Versionar o código local, enviá-lo para um repositório Git e preparar a VPS para o deploy.
*   **O que foi feito**:
    1.  **Inicialização do Git Local**: Como o projeto local ainda não era um repositório Git, inicializamos um com `git init`.
    2.  **Envio para o GitHub**:
        - Adicionamos o repositório `betjuliano/webwhats` como remoto.
        - Para garantir a segurança, removemos os arquivos `.env` e `.env.example` do commit, evitando a exposição de credenciais.
        - Enviamos o código local para o branch `main` do GitHub, substituindo qualquer conteúdo que existia anteriormente (`git push --force`).
    3.  **Clone na VPS**: Clonamos o repositório atualizado do GitHub para o diretório `/root/webwhats` na VPS.
    4.  **Criação e Preenchimento do `.env`**: Criamos e preenchemos o arquivo `/root/webwhats/.env` na VPS com as variáveis de ambiente necessárias para produção.
*   **Conclusão**: O código-fonte está na VPS e todas as configurações de ambiente foram definidas.
*   **Status**: ✅ **Concluído**.

#### **6.3. Deploy com Docker Compose e Traefik**

*   **Objetivo**: Subir a aplicação e seus serviços, com o Traefik gerenciando o acesso externo e os certificados SSL.
*   **Passos**:
    1.  **Revisar o `docker-compose.yml`**:
        - O arquivo já está configurado para persistir os dados do Postgres e Redis usando volumes.
        - O serviço principal (`webwhats-app`) está configurado com `labels` para que o Traefik o descubra automaticamente.
        - **Roteador HTTP**: Redireciona todo o tráfego de `http://webwhats.iaprojetos.com.br` para a versão HTTPS.
        - **Roteador HTTPS**: Gerencia o tráfego seguro para `https://webwhats.iaprojetos.com.br`, habilitando o TLS e usando o `letsencryptresolver` para obter o certificado SSL. Você pode precisar ajustar o nome do `certresolver` para o que você usa na sua configuração do Traefik.
        - **Serviço**: Informa ao Traefik que a aplicação está rodando na porta `3000` dentro do contêiner.
    2.  **Build e Execução**:
        - Dentro da pasta do projeto na VPS, execute o comando:
          ```bash
          sudo docker-compose up --build -d
          ```
        - O `--build` força a reconstrução da imagem da aplicação, o que é importante após alterações no código.
        - O `-d` (detached) executa os contêineres em segundo plano.
    3.  **Verificar o Status**:
        - Acesse o Portainer para uma visualização gráfica do status dos contêineres e logs.
        - Ou use os comandos no terminal:
          - `sudo docker-compose ps` para ver se todos os contêineres estão rodando (`Up`).
          - `sudo docker-compose logs -f <nome_do_serviço>` (ex: `webwhats-app`) para acompanhar os logs em tempo real e verificar se há erros na inicialização.
    4.  **Acessar a Aplicação**: Após o deploy, a aplicação deve estar acessível na URL configurada nos `labels` do Traefik (ex: `https://webwhats.iaprojetos.com.br`).

#### **6.4. Pós-Deploy: Manutenção e Atualizações**

*   **Objetivo**: Manter a aplicação atualizada e funcionando.
*   **Passos para Atualizar a Aplicação**:
    1.  Acesse a pasta do projeto na VPS.
    2.  Puxe as últimas alterações do seu repositório Git: `git pull`.
    3.  Reconstrua e reinicie os contêineres:
        ```bash
        sudo docker-compose up --build -d
        ```
*   **Status**: ✏️ **A ser implementado**. 