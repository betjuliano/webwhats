# Configuração do WebWhats - Resolução dos Problemas

## Problemas Identificados nos Logs:

1. **Failed to send message via Evolution API**
2. **Falha ao lidar com o comando de conhecimento /curso**
3. **Failed to process incoming webhook**
4. **Message Processing errors**

## Configurações Necessárias:

### 1. Variáveis de Ambiente (.env)

Crie um arquivo `.env` na raiz do projeto webwhats com as seguintes variáveis:

```bash
# Configurações da Aplicação
NODE_ENV=production
PORT=3000

# Configurações do Banco de Dados
DATABASE_URL=postgresql://webwhats:SENHA_POSTGRES@postgres:5432/webwhats?sslmode=disable

# Configurações do Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=SENHA_REDIS

# Configurações da Evolution API
EVOLUTION_API_URL=https://evolution.iaprojetos.com.br
EVOLUTION_API_KEY=SUA_CHAVE_EVOLUTION_API_AQUI
WHATSAPP_INSTANCE=NOME_DA_SUA_INSTANCIA

# Configurações de Admin (OBRIGATÓRIO para comandos funcionarem)
ADMIN_CHAT_ID=5511999999999@s.whatsapp.net

# Configurações de Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# Configurações de CORS
ALLOWED_ORIGINS=*

# Configurações de Métricas
ENABLE_METRICS=true

# Configurações de OpenAI
OPENAI_API_KEY=SUA_CHAVE_OPENAI

# Configurações para Docker Compose
POSTGRES_PASSWORD=senha_super_segura_postgres
```

### 2. Base de Conhecimento

Para resolver o erro do comando `/curso`, você precisa:

1. Criar o diretório da base de conhecimento:
```bash
mkdir -p src/data/knowledge-base
```

2. Gerar os embeddings para a base de conhecimento:
```bash
npm run knowledge:build
```

### 3. Verificar Status da Evolution API

Execute este teste para verificar se a Evolution API está funcionando:

```bash
curl -X GET \
  https://evolution.iaprojetos.com.br/instance/connectionState/SUA_INSTANCIA \
  -H 'apikey: SUA_CHAVE_API'
```

### 4. Estrutura de Diretórios Necessária

```
webwhats/
├── src/
│   ├── data/
│   │   └── knowledge-base/
│   │       ├── curso.json
│   │       ├── projetos.json
│   │       └── orientacoes.json
│   └── conhecimento/
│       └── orientacoes/
└── logs/
```

## Comandos para Resolver os Problemas:

### 1. Verificar Logs Atuais
```bash
cd webwhats && tail -f logs/*.log
```

### 2. Restart dos Serviços
```bash
docker-compose down && docker-compose up -d
```

### 3. Verificar Status dos Containers
```bash
docker-compose ps
docker-compose logs webwhats-app
```

### 4. Gerar Base de Conhecimento
```bash
cd webwhats && npm run knowledge:build
```

## Correções Aplicadas no Código:

1. **Melhor tratamento de erros na Evolution API**
2. **Validação de variáveis de ambiente**
3. **Logs mais detalhados para debug**
4. **Retry logic para falhas de comunicação** 