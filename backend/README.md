# Konekt Backend (Local)

Backend local simples para MVP com 30 usuários, com **storage local**, **HTTPS opcional** e **túnel externo**.

## ✅ Requisitos

- Node.js 18+
- (Opcional) Docker para banco local futuro

## ▶️ Rodar o backend

```bash
cd backend
npm install
npm run dev
```

Servidor: `http://0.0.0.0:3000`

## 🔒 HTTPS local (recomendado para mobile)

1) Instale mkcert: https://github.com/FiloSottile/mkcert  
2) Gere certificados:

```bash
mkcert -install
mkdir -p backend/certs
mkcert -key-file backend/certs/key.pem -cert-file backend/certs/cert.pem localhost 127.0.0.1
```

3) Suba com HTTPS:

```bash
cd backend
HTTPS=true HTTPS_KEY=./certs/key.pem HTTPS_CERT=./certs/cert.pem npm run dev
```

## 🌐 Acesso fora da mesma rede Wi‑Fi

### Cloudflare Tunnel (recomendado)

1) Instale o `cloudflared`  
2) Crie o túnel apontando para sua porta local:

```bash
cloudflared tunnel --url http://localhost:3000
```

Ele vai gerar um URL público para o celular acessar.

### Ngrok (alternativa)

```bash
ngrok http 3000
```

## 🧠 CORS (frontend gordo)

O backend já permite:
- `http://localhost:5174`
- `http://127.0.0.1:5174`

Se mudar o domínio, ajuste `FRONTEND_ORIGIN`.

## 🗄️ Banco local (Docker)

```bash
cd backend
docker compose up -d
```

## ♻️ Resetar dados quando quiser

```bash
npm run reset-db
```

## 📁 Upload local

Arquivos enviados ficam em `backend/uploads/`  
Servidos como URL: `/uploads/arquivo.ext`

