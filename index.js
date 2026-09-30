// Cloud Function: quando o app grava notifications/{uid}/{remetente}, envia um push (FCM)
// para todos os aparelhos cadastrados em fcm_tokens/{uid}.
const {onValueWritten}=require('firebase-functions/v2/database');
const admin=require('firebase-admin');
admin.initializeApp();

// A região precisa ser a MESMA do seu Realtime Database
// (us-central1, europe-west1 ou asia-southeast1 — veja no Console > Realtime Database).
const REGION='us-central1';

exports.enviarPush=onValueWritten({ref:'/notifications/{uid}/{senderKey}',region:REGION},async(event)=>{
  if(!event.data.after.exists())return; // é só o app apagando o aviso já lido
  const n=event.data.after.val()||{};
  const {uid,senderKey}=event.params;

  const snap=await admin.database().ref(`fcm_tokens/${uid}`).once('value');
  const tokens=Object.keys(snap.val()||{});
  if(!tokens.length)return;

  const res=await admin.messaging().sendEachForMulticast({
    tokens,
    data:{title:String(n.name||'ChatsApp'),body:String(n.text||'Nova mensagem').slice(0,140),key:senderKey,tag:'chat-'+senderKey},
    webpush:{headers:{Urgency:'high',TTL:'86400'}},
    android:{priority:'high'}
  });

  // remove tokens de aparelhos que não existem mais
  const dead=[];
  res.responses.forEach((r,i)=>{
    const c=r.error&&r.error.code;
    if(!r.success&&(c==='messaging/registration-token-not-registered'||c==='messaging/invalid-registration-token'||c==='messaging/invalid-argument'))dead.push(tokens[i]);
  });
  await Promise.all(dead.map(t=>admin.database().ref(`fcm_tokens/${uid}/${t}`).remove()));
});
