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

Sem isso, o app vai funcionar parcialmente e dar erro **"Permission denied"** ao adicionar familiares, enviar mensagens ou notificar chamadas.

No Firebase Console → **Realtime Database** → **Regras**, cole exatamente isto e clique em **Publicar**:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "email_index": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "contact_requests": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null"
      }
    },
    "messages": {
      "$chatId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "notifications": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null"
      }
    },
    "calls": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "signaling": {
      "$chatId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "fcm_tokens": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "typing": {
      "$chatId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

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

Navegador não consegue receber nada do Realtime Database com o app fechado. Por isso o app usa **Firebase Cloud Messaging (push)**, igual WhatsApp/Telegram. São 4 passos, feitos uma única vez:

1. **Chave VAPID** — Firebase Console → ⚙️ Configurações do projeto → **Cloud Messaging** → *Certificados push da Web* → **Gerar par de chaves**. Cole a chave em `VAPID_KEY` no início do `<script type="module">` do `index.html`.
2. **Regras** — publique de novo as regras acima (agora com o bloco `fcm_tokens`).
3. **Cloud Function** — o envio do push precisa rodar no servidor. Exige o plano **Blaze** (pay-as-you-go; para uso familiar o custo fica em zero dentro da cota gratuita). Na pasta do projeto:
```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```
   Se o seu Realtime Database não estiver em `us-central1`, ajuste `REGION` em `functions/index.js`.
4. **Publicar** `index.html` e `sw.js` juntos, na mesma pasta/raiz do site (HTTPS obrigatório). Cada pessoa abre o app, toca em **Ativar** no aviso de notificações — e pronto.

**iPhone:** só funciona (iOS 16.4+) com o app instalado na Tela de Início (Safari → Compartilhar → Adicionar à Tela de Início) e aberto por esse ícone. O `manifest.json` já referenciado no `index.html` precisa existir.
