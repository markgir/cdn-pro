# CDN Pro

**Self-hosted CDN Manager para WooCommerce e PrestaShop**

Desenvolvido por [iddigital.pt](https://iddigital.pt) — plataforma de aceleração de e-commerce auto-hospedada, construída com NestJS, TypeScript, Prisma e Redis.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | NestJS 11 + TypeScript 5.6 |
| ORM | Prisma 6.7 + PostgreSQL |
| Cache | Redis (ioredis 5) + LRU in-memory |
| Auth | JWT (passport-jwt) + bcrypt |
| Imagens | Sharp 0.34 |
| Métricas | Prometheus (prom-client) |
| Rate Limiting | @nestjs/throttler |
| Segurança | Helmet + class-validator |

---

## Estrutura

```
cdn-pro/
├── prisma/
│   └── schema.prisma          # Modelos: admin, origin, cache_entry, request_log
├── scripts/
│   └── safe-seed.ts           # Seed inicial seguro
├── src/
│   ├── main.ts                # Bootstrap + Swagger + pipes globais
│   ├── app.module.ts          # Módulo raiz + ThrottlerModule global
│   ├── auth/                  # JWT login, guards, estratégias
│   ├── cache/                 # Serviço de cache LRU + Redis
│   ├── health/                # Health checks (/health)
│   ├── images/                # Gerador de imagens SVG + Sharp
│   ├── metrics/               # Endpoint Prometheus (/metrics)
│   ├── origins/               # CRUD de origens (lojas)
│   ├── prisma/                # PrismaService singleton
│   ├── proxy/                 # Reverse proxy com cache
│   └── admin/                 # Dashboard admin
└── test/
    └── jest-e2e.json
```

---

## Requisitos

- Node.js >= 18.18.0
- PostgreSQL >= 14
- Redis >= 6
- Yarn 4.x

---

## Instalação

```bash
# 1. Clonar
git clone https://github.com/markgir/cdn-pro.git
cd cdn-pro

# 2. Instalar dependências
yarn install

# 3. Configurar ambiente
cp .env.example .env
# Editar .env com as tuas credenciais

# 4. Criar base de dados e correr migrações
yarn db:migrate

# 5. Seed inicial (cria admin padrão)
yarn db:seed

# 6. Arrancar em desenvolvimento
yarn start:dev
```

---

## Variáveis de Ambiente

Criar ficheiro `.env` na raiz (ver `.env.example`):

```env
# Base de dados
DATABASE_URL="postgresql://user:password@localhost:5432/cdn_pro"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=coloca_aqui_uma_chave_forte_e_aleatoria
JWT_EXPIRES_IN=24h

# Rate limiting (pedidos por janela)
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100

# Ambiente
NODE_ENV=development
PORT=3000
```

> ⚠️ **Nunca** colocar o `.env` no git. Está no `.gitignore`.

---

## API

Depois de arrancar, a documentação Swagger está disponível em:

```
http://localhost:3000/api
```

### Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| POST | /auth/login | Login — devolve JWT |
| GET | /origins | Listar origens |
| POST | /origins | Criar origem |
| PUT | /origins/:id | Actualizar origem |
| DELETE | /origins/:id | Remover origem |
| GET | /cache/stats | Estatísticas do cache |
| POST | /cache/flush | Limpar todo o cache |
| POST | /cache/purge | Purge por chave/prefixo |
| GET | /health | Health check |
| GET | /metrics | Métricas Prometheus |

---

## Testes

```bash
# Unitários
yarn test

# Com cobertura
yarn test:cov

# E2E
yarn test:e2e
```

---

## Licença

MIT — © 2026 [iddigital.pt](https://iddigital.pt)
