// Service Worker do ChatsApp Família: recebe push (FCM) com o app fechado e mostra a notificação.
const ICON='https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/1f4ac_3d.png';

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',(e)=>e.waitUntil((async()=>{
  // limpa caches de versões antigas para o app sempre carregar a versão nova
  for(const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch',()=>{}); // necessário para o app ser instalável (PWA)

self.addEventListener('push',(event)=>{
  event.waitUntil((async()=>{
    let p={};
    try{ p=event.data?event.data.json():{}; }catch(e){ p={data:{body:event.data&&event.data.text()}}; }
    const d=p.data||p.notification||p;
    const kind=d.kind||'message';
    const tag=d.tag||'chatsapp';

    // Quem ligou desistiu antes de atender: some o aviso de "chamada tocando".
    if(kind==='call-end'){
      (await self.registration.getNotifications({tag})).forEach(n=>n.close());
    }

    // App aberto e visível: o próprio app já avisa (toast, tela de chamada), não duplica.
    const wins=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(wins.some(c=>c.visibilityState==='visible'))return;

    if(kind==='call'){
      await self.registration.showNotification(d.title||'Chamada',{
        body:d.body||'Chamada recebida',icon:ICON,badge:ICON,tag,renotify:true,
        requireInteraction:true,vibrate:[300,150,300,150,300,150,300],
        data:{key:d.key||'',ts:Date.now(),kind}
      });
      return;
    }
    if(kind==='call-end'){
      await self.registration.showNotification(d.title||'Chamada perdida',{
        body:d.body||'',icon:ICON,badge:ICON,tag:'missed-'+(d.key||''),
        data:{key:d.key||'',ts:Date.now(),kind}
      });
      return;
    }

    // Se o app acabou de mostrar este mesmo aviso, só substitui em silêncio.
    const recent=(await self.registration.getNotifications({tag}))
      .some(n=>n.data&&n.data.ts&&Date.now()-n.data.ts<10000);
    await self.registration.showNotification(d.title||'ChatsApp',{
      body:d.body||'Nova mensagem',icon:ICON,badge:ICON,tag,renotify:!recent,
      vibrate:[120,60,120],data:{key:d.key||'',ts:Date.now()}
    });
  })());
});

self.addEventListener('notificationclick',(event)=>{
  event.notification.close();
  const key=(event.notification.data&&event.notification.data.key)||'';
  event.waitUntil((async()=>{
    const wins=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of wins){
      if('focus' in c){ await c.focus(); if(key)c.postMessage({type:'open-chat',key}); return; }
    }
    await self.clients.openWindow(key?'./?chat='+encodeURIComponent(key):'./');
  })());
});
