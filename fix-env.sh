#!/bin/bash

echo "🔧 Corrigindo problemas no arquivo .env..."

# Backup do arquivo atual
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Corrige a chave OpenAI quebrada em duas linhas
echo "📝 Corrigindo chave OpenAI quebrada..."
sed -i '/^OPENAI_API_KEY=/,/^[A-Z]/ {
    /^OPENAI_API_KEY=/ {
        N
        s/OPENAI_API_KEY=\(.*\)\n\(.*\)/OPENAI_API_KEY=\1\2/
    }
}' .env

# Adiciona configurações necessárias se não existirem
echo "➕ Adicionando configurações necessárias..."

# NODE_ENV
if ! grep -q "^NODE_ENV=" .env; then
    echo "NODE_ENV=production" >> .env
fi

# PORT
if ! grep -q "^PORT=" .env; then
    echo "PORT=3000" >> .env
fi

# DATABASE_URL
if ! grep -q "^DATABASE_URL=" .env; then
    echo "DATABASE_URL=postgresql://webwhats:\${POSTGRES_PASSWORD}@postgres:5432/webwhats?sslmode=disable" >> .env
fi

# REDIS_URL
if ! grep -q "^REDIS_URL=" .env; then
    echo "REDIS_URL=redis://redis:6379" >> .env
fi

# Rate limiting
if ! grep -q "^RATE_LIMIT_WINDOW=" .env; then
    echo "RATE_LIMIT_WINDOW=900000" >> .env
fi

if ! grep -q "^RATE_LIMIT_MAX=" .env; then
    echo "RATE_LIMIT_MAX=100" >> .env
fi

# CORS
if ! grep -q "^ALLOWED_ORIGINS=" .env; then
    echo "ALLOWED_ORIGINS=*" >> .env
fi

# Metrics
if ! grep -q "^ENABLE_METRICS=" .env; then
    echo "ENABLE_METRICS=true" >> .env
fi

echo "✅ Correções aplicadas com sucesso!"
echo ""
echo "🧪 Testando conexão com Evolution API..."
curl -s -X GET \
  "${EVOLUTION_API_URL}/instance/connectionState/${WHATSAPP_INSTANCE}" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  | python3 -m json.tool 2>/dev/null || echo "⚠️  Verifique se a Evolution API está acessível"

echo ""
echo "📋 Próximos passos:"
echo "1. Verifique se o arquivo .env foi corrigido: cat .env"
echo "2. Crie arquivos de base de conhecimento: npm run knowledge:build"
echo "3. Reinicie os serviços: docker-compose restart"
echo "" 