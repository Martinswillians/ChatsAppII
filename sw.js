// Service Worker mínimo do ChatsApp.
//
// Este projeto não usa Push Notifications reais (que exigiriam um servidor
// backend com chaves VAPID — fora do escopo de um app hospedado de forma
// totalmente estática no GitHub Pages). As notificações de novas mensagens
// funcionam através da Notification API diretamente pela aba/janela aberta
// (ver função showNotif() em index.html), o que cobre o caso de uso de
// "app aberto em segundo plano, minimizado, ou em outra aba".
//
// Este Service Worker existe apenas para que o navegador reconheça o app
// como instalável (critério técnico do PWA), permitindo criar um atalho
// na área de trabalho / tela inicial.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Sem cache customizado por enquanto — todas as requisições passam direto
// para a rede, mantendo o app sempre atualizado com a versão mais recente.
self.addEventListener('fetch', () => {});
