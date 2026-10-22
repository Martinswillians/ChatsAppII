# 💬 ChatsApp Família

App de mensagens e videochamada para a família, estilo WhatsApp, com Firebase como backend.

---

## ✅ Já está configurado

As credenciais do Firebase já estão fixas dentro do `index.html` (projeto `chatssappii`). **A família não precisa configurar nada** — basta abrir o app e cadastrar a conta. Veja o fluxo:

1. Abrir o `index.html` (ou o link, se você hospedar)
2. Clicar em **Cadastrar**, preencher nome, e-mail, senha e escolher um avatar (emoji ou foto)
3. Adicionar os familiares pelo e-mail deles
4. Conversar e fazer videochamadas

Se um dia precisar trocar de projeto Firebase, basta editar o bloco `firebaseConfig` no início do `<script type="module">` dentro do `index.html` — é a única parte que muda.

---

## 🔒 Passo obrigatório: Regras do Realtime Database

Sem isso o app dá **"permission_denied"** (ex.: ao criar grupo). Abra o arquivo `database.rules.json` desta pasta, copie **todo** o conteúdo, cole em Firebase Console → **Realtime Database** → **Regras** (substituindo o que está lá) e clique em **Publicar**.

Ele inclui os nós que faltavam nas regras antigas: `groups`, `group_invites` e `call_hangup` (além de `fcm_tokens`).

---

## 🔑 Passo obrigatório: Ativar login por e-mail/senha

No Firebase Console → **Authentication** → **Sign-in method** (ou "Método de login") → ative **E-mail/senha**. Sem isso, cadastro e login falham mesmo com as credenciais corretas no código.

---

## ✨ Como a comunicação real funciona

Como todas as contas usam o **mesmo projeto Firebase** (já embutido no código), qualquer pessoa que se cadastrar no app consegue:
- Aparecer no **Firebase Console → Authentication → Usuários**
- Ser encontrada por outro familiar através do e-mail
- Trocar mensagens reais em tempo real (nada de robô/resposta automática)
- Fazer e receber videochamadas reais via WebRTC, com a outra pessoa vendo a câmera de verdade

---

## 👤 Foto de perfil

Na tela de cadastro, escolha entre:
- **😊 Emoji** — selecione um ícone colorido entre as opções
- **📷 Foto** — clique na área de upload e escolha uma imagem do dispositivo

A imagem é salva como Base64 no perfil do usuário no Realtime Database.

---

## 📱 Resolvendo problemas comuns

**"Os usuários não aparecem no Authentication"**
→ Verifique se ativou **E-mail/senha** em Authentication → Sign-in method.

**"Permission denied" ao adicionar familiar ou enviar mensagem**
→ Publique as regras da seção acima no Firebase Console.

**"Usuário não encontrado" ao adicionar pelo e-mail**
→ A outra pessoa precisa ter se cadastrado primeiro no mesmo app (mesmo projeto Firebase).

**Quero trocar as credenciais do Firebase**
→ Edite o objeto `firebaseConfig` no topo do `<script type="module">` dentro do `index.html`.

---

## 🔧 Hospedar gratuitamente para a família usar

**Opção 1 — Netlify Drop** (mais simples)
Arraste a pasta `ChatApp` para netlify.com/drop e compartilhe o link gerado com a família.

**Opção 2 — Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

Depois de hospedado, qualquer familiar só precisa abrir o link e se cadastrar — sem nenhum passo extra de configuração.


---

## 🔔 Notificações em segundo plano (app fechado / celular bloqueado)

Usa **Firebase Cloud Messaging (push)** + um **Cloudflare Worker gratuito** (pasta `worker/`) que envia o push. Não precisa do plano Blaze nem de cartão.

1. **Chave VAPID** — Firebase → Configurações do projeto → Cloud Messaging → *Certificados push da Web*. Use o **botão de copiar** e cole em `VAPID_KEY` no `index.html` (87 caracteres, uma linha só).
2. **Conta de serviço** — Firebase → Configurações do projeto → *Contas de serviço* → **Gerar nova chave privada**. Baixa um `.json`. ⚠️ **Nunca suba esse arquivo para o GitHub** (o repositório é público). Ele só vai para a Cloudflare, no passo 3.
3. **Worker** — em dash.cloudflare.com → *Workers & Pages* → **Create** → *Hello World* → nome `chatsapp-push` → **Deploy** → **Edit code** → apague tudo, cole o conteúdo de `worker/worker.js` → **Deploy**.
   Depois, em **Settings → Variables and secrets** → Add → tipo **Secret**, nome `SERVICE_ACCOUNT_JSON`, valor = o conteúdo inteiro do `.json` do passo 2 → Deploy.
4. **URL do Worker** — copie a URL do Worker (`https://chatsapp-push.SEU-SUBDOMINIO.workers.dev`) e cole em `PUSH_WORKER_URL` no `index.html`.
5. **Regras** — publique o `database.rules.json` (inclui `fcm_tokens`).
6. Suba `index.html` e `sw.js` no GitHub Pages. Cada pessoa abre o app e permite as notificações.

Se o `ALLOWED_ORIGIN` for diferente de `https://martinswillians.github.io`, crie a variável `ALLOWED_ORIGIN` no Worker com o endereço do seu site (sem `/` no final).

**Conferir se está funcionando:** no console do app deve aparecer `[Push] aparelho registrado...`, e em Firebase → Realtime Database deve existir o nó `fcm_tokens`. Para testar, feche a aba do destinatário e mande uma mensagem com outra conta.

**iPhone:** só funciona (iOS 16.4+) com o app instalado na Tela de Início (Safari → Compartilhar → Adicionar à Tela de Início) e aberto por esse ícone.

**Limites do plano grátis:** 100 mil pedidos por dia no Worker, muito acima do uso de uma família. Qualquer pessoa cadastrada no app consegue pedir push ao Worker (mesmo nível de confiança das regras do banco); se o cadastro for aberto ao público, vale pensar em restringi-lo.

**Limpeza no GitHub:** apague `index.js`, `package.json` e `firebase.json` da raiz do repositório. Eram da Cloud Function, que não é mais usada.
