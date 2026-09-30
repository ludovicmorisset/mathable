'use strict';

const byId=id=>document.getElementById(id);
const notice=byId('notice');
let pendingEmail='';
let currentUser=null;

async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'requete_impossible');
  return data;
}
function message(text,success=false){notice.textContent=text;notice.classList.toggle('success',success);}
function errorText(error){return ({
  identifiants_invalides:'Adresse e-mail ou mot de passe incorrect.',
  email_ou_pseudo_deja_utilise_ou_base_indisponible:'Cette adresse ou ce pseudo est déjà utilisé, ou le service est indisponible.',
  inscription_invalide:'Vérifiez le pseudo, l’adresse e-mail et les critères du mot de passe.',
  code_expire_ou_bloque:'Code expiré. Recommencez l’inscription pour en recevoir un autre.',
  code_incorrect:'Ce code ne correspond pas. Vérifiez le message reçu.',
  pseudo_invalide:'Un pseudo doit contenir de 3 à 20 lettres, chiffres ou _.',
  joueur_introuvable:'Aucun joueur vérifié ne porte ce pseudo.',
  demande_existante:'Une demande est déjà en cours.',
  deja_amis:'Vous êtes déjà amis.',
  ami_requis:'Choisissez un ami avant de créer la partie.',
  ami_introuvable:'Cet ami n’est plus disponible.',
  invitation_introuvable:'Invitation inconnue ou vous n’êtes pas invité.'
})[error.message]||'Une erreur est survenue. Réessayez.';}
function showAuth(){byId('authView').hidden=false;byId('socialView').hidden=true;}
function showSocial(){byId('authView').hidden=true;byId('socialView').hidden=false;}
function setTab(register){
  byId('loginTab').classList.toggle('active',!register);
  byId('registerTab').classList.toggle('active',register);
  byId('loginTab').setAttribute('aria-selected',String(!register));
  byId('registerTab').setAttribute('aria-selected',String(register));
  byId('loginForm').hidden=register;
  byId('registerForm').hidden=!register;
  byId('verifyForm').hidden=true;
  message('');
}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}

async function loadSocial(){
  const [friends,games]=await Promise.all([api('/api/friends'),api('/api/games')]);
  const list=byId('friendsList');
  const select=byId('friendSelect');
  list.replaceChildren();select.replaceChildren(new Option('Choisir un ami',''));
  const accepted=friends.filter(friend=>friend.status==='accepted');
  for(const friend of friends){
    const row=element('div','friend-row');
    row.append(element('span','person-dot',friend.username.slice(0,1).toUpperCase()));
    const details=element('div','row-main');
    details.append(element('strong','',friend.username));
    const pending=friend.status==='pending';
    details.append(element('small','',pending?(friend.sent?'Demande envoyée':'Demande reçue'):'Ami'));
    row.append(details);
    if(pending&&!friend.sent){
      const accept=element('button','button primary row-action','Accepter');accept.type='button';
      accept.onclick=async()=>{try{await api(`/api/friends/requests/${friend.other_id}/accept`,{method:'POST'});await loadSocial();}catch(error){message(errorText(error));}};
      row.append(accept);
    }else{
      const remove=element('button','button subtle row-action',pending?'Annuler':'Retirer');remove.type='button';
      remove.onclick=async()=>{try{await api(`/api/friends/${friend.other_id}`,{method:'DELETE'});await loadSocial();}catch(error){message(errorText(error));}};
      row.append(remove);
    }
    list.append(row);
  }
  if(!friends.length)list.append(element('p','empty','Votre liste est vide. Ajoutez un joueur par son pseudo.'));
  for(const friend of accepted)select.add(new Option(friend.username,friend.username));
  const gamesList=byId('gamesList');gamesList.replaceChildren();
  for(const game of games){
    const row=element('div','game-row');
    row.append(element('span','person-dot','↔'));
    const details=element('div','row-main');
    details.append(element('strong','',`${game.players.join(' · ')} · ${game.code}`));
    details.append(element('small','',game.mode==='simultaneous'?'Coups simultanés':'Tour par tour'));
    row.append(details);
    const open=element('a','button subtle row-action','Ouvrir');open.href=`/online.html?code=${encodeURIComponent(game.code)}`;
    row.append(open);gamesList.append(row);
  }
  if(!games.length)gamesList.append(element('p','empty','Vos parties apparaîtront ici.'));
}

byId('loginTab').onclick=()=>setTab(false);
byId('registerTab').onclick=()=>setTab(true);
byId('loginForm').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{await api('/api/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(form))});location.reload();}
  catch(error){message(errorText(error));}
};
byId('registerForm').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);const values=Object.fromEntries(form);
  values.email=String(values.email).trim().toLowerCase();values.username=String(values.username).trim().toLowerCase();pendingEmail=values.email;
  try{
    await api('/api/auth/register',{method:'POST',body:JSON.stringify(values)});
    byId('loginForm').hidden=true;byId('registerForm').hidden=true;byId('verifyForm').hidden=false;
    message('Inscription créée. Vérifiez votre boîte e-mail pour le code à six chiffres.',true);
  }catch(error){message(errorText(error));}
};
byId('verifyForm').onsubmit=async event=>{
  event.preventDefault();const code=new FormData(event.currentTarget).get('code');
  try{
    await api('/api/auth/verify',{method:'POST',body:JSON.stringify({email:pendingEmail,code})});
    setTab(false);message('Adresse vérifiée. Vous pouvez maintenant vous connecter.',true);
  }catch(error){message(errorText(error));}
};
byId('logoutButton').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.reload();};
byId('friendForm').onsubmit=async event=>{
  event.preventDefault();const username=new FormData(event.currentTarget).get('username');
  try{await api('/api/friends/requests',{method:'POST',body:JSON.stringify({username})});event.currentTarget.reset();message('Demande envoyée.',true);await loadSocial();}
  catch(error){message(errorText(error));}
};
byId('createGameForm').onsubmit=async event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
  try{const game=await api('/api/games',{method:'POST',body:JSON.stringify(values)});location.href=`/online.html?code=${encodeURIComponent(game.code)}`;}
  catch(error){message(errorText(error));}
};
byId('joinGameForm').onsubmit=async event=>{
  event.preventDefault();const code=new FormData(event.currentTarget).get('code');
  try{const game=await api('/api/games/join',{method:'POST',body:JSON.stringify({code})});location.href=`/online.html?code=${encodeURIComponent(game.code)}`;}
  catch(error){message(errorText(error));}
};

(async()=>{
  try{
    currentUser=await api('/api/me');
    if(!currentUser)throw new Error('authentification_requise');
    byId('welcomeName').textContent=currentUser.username;
    showSocial();
    await loadSocial();
  }catch{
    showAuth();
  }
})();
