'use strict';

const byId=id=>document.getElementById(id);
const notice=byId('notice');
let pendingEmail='';
let pendingResetEmail='';
let currentUser=null;

async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'requete_impossible');
  return data;
}
function message(text,success=false){notice.textContent=text;notice.classList.toggle('success',success);notice.classList.toggle('error',!success&&Boolean(text));}
function errorText(error){return ({
  identifiants_invalides:'Adresse e-mail ou mot de passe incorrect.',
  email_ou_pseudo_deja_utilise_ou_base_indisponible:'Cette adresse ou ce pseudo est déjà utilisé, ou le service est indisponible.',
  smtp_requis:'La création de compte nécessite la configuration de l’envoi d’e-mails.',
  smtp_indisponible:'L’e-mail de vérification n’a pas pu être envoyé. Réessayez plus tard.',
  inscription_invalide:'Vérifiez le pseudo, l’adresse e-mail et les critères du mot de passe.',
  code_expire_ou_bloque:'Code expiré ou bloqué. Demandez-en un nouveau.',
  code_incorrect:'Ce code ne correspond pas. Vérifiez le message reçu.',
  reinitialisation_invalide:'Vérifiez le code et les critères du nouveau mot de passe.',
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
  byId('forgotPasswordForm').hidden=true;
  byId('resetPasswordForm').hidden=true;
  message('');
}
function showLoginForm(){setTab(false);}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
const registerPassword=byId('registerPassword');
const passwordError=byId('passwordError');
let passwordValidationVisible=false;
function validateRegisterPassword(showError=false){
  if(showError)passwordValidationVisible=true;
  const value=registerPassword.value;
  const missing=[];
  if(value.length<10)missing.push('10 caractères minimum');
  if(!/[A-Z]/.test(value))missing.push('une majuscule');
  if(!/[a-z]/.test(value))missing.push('une minuscule');
  if(!/\d/.test(value))missing.push('un chiffre');
  const invalid=value.length>0&&missing.length>0;
  registerPassword.setAttribute('aria-invalid',String(invalid));
  passwordError.hidden=!(passwordValidationVisible&&invalid);
  passwordError.textContent=invalid?`Mot de passe incomplet : ajoutez ${missing.join(', ')}.`:'';
  return !invalid;
}
function gameDate(game){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(game.updated_at||game.created_at));}

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
  const gamesAttention=byId('gamesAttention');
  const activeGames=games.filter(game=>!game.game_over);
  const gamesAwaitingMe=activeGames.filter(game=>game.my_turn).length;
  gamesAttention.hidden=gamesAwaitingMe===0;
  gamesAttention.textContent=gamesAwaitingMe===1?'Votre tour est attendu dans 1 partie.':`Votre tour est attendu dans ${gamesAwaitingMe} parties.`;
  const orderedGames=[...activeGames].sort((first,second)=>Number(second.my_turn)-Number(first.my_turn));
  for(const game of orderedGames){
    const row=element('div','game-row');
    if(game.my_turn)row.classList.add('awaiting-turn');
    row.append(element('span','person-dot','↔'));
    const details=element('div','row-main');
    details.append(element('strong','',`${game.players.join(' · ')} · ${game.code}`));
    const stateLabel=game.game_over?'Partie terminée':game.mode==='simultaneous'?'Coups simultanés':game.my_turn?'À vous de jouer':`Au tour de ${game.active_player||'votre adversaire'}`;
    details.append(element('small',game.my_turn?'game-state my-turn':'game-state',stateLabel));
    row.append(details);
    const open=element('a',game.my_turn?'button primary row-action':'button subtle row-action',game.my_turn?'Jouer':'Ouvrir');open.href=`/online.html?code=${encodeURIComponent(game.code)}`;
    row.append(open);gamesList.append(row);
  }
  if(!activeGames.length)gamesList.append(element('p','empty','Aucune partie en cours. Lancez une partie avec un ami ou rejoignez une invitation.'));

  const finishedGames=games.filter(game=>game.game_over);
  const historyList=byId('historyList');
  const historyCount=byId('historyCount');
  const topScores=byId('topScores');
  const drawHistory=()=>{
    const query=byId('historySearch').value.trim().toLocaleLowerCase('fr');
    const matches=finishedGames.filter(game=>`${game.code} ${game.opponent||''} ${(game.players||[]).join(' ')}`.toLocaleLowerCase('fr').includes(query));
    historyList.replaceChildren();
    historyCount.textContent=query?`${matches.length} résultat${matches.length===1?'':'s'}`:`${finishedGames.length} partie${finishedGames.length===1?' terminée':'s terminées'}`;
    for(const game of matches){
      const row=element('div','game-row history-row');
      row.append(element('span','person-dot','↔'));
      const details=element('div','row-main');
      details.append(element('strong','',`${game.opponent||game.players.filter(name=>name!==currentUser.username).join(' · ')} · ${game.code}`));
      details.append(element('small','game-state',`${game.mode==='simultaneous'?'Coups simultanés':'Tour par tour'} · ${gameDate(game)}`));
      row.append(details);
      const score=element('strong','history-score',`${game.my_score??0} — ${game.opponent_score??0}`);
      score.setAttribute('aria-label',`Votre score ${game.my_score??0}, score adverse ${game.opponent_score??0}`);
      row.append(score);
      const open=element('a','button subtle row-action','Voir');open.href=`/online.html?code=${encodeURIComponent(game.code)}`;row.append(open);
      historyList.append(row);
    }
    if(!matches.length)historyList.append(element('p','empty',query?'Aucune partie ne correspond à cette recherche.':'Les parties terminées apparaîtront ici.'));

    topScores.replaceChildren();
    const bestGames=[...finishedGames].sort((first,second)=>(second.my_score||0)-(first.my_score||0)||new Date(second.updated_at)-new Date(first.updated_at)).slice(0,3);
    for(const [index,game] of bestGames.entries()){
      const item=element('li','top-score-row');
      item.append(element('span','rank-number',String(index+1).padStart(2,'0')));
      const details=element('span','rank-details');
      details.append(element('strong','',`${game.my_score??0} pts`));
      details.append(element('small','',`${game.opponent||'Partie'} · ${gameDate(game)}`));
      item.append(details);topScores.append(item);
    }
    if(!bestGames.length)topScores.append(element('li','empty','Aucun score final pour le moment.'));
  };
  byId('historySearch').oninput=drawHistory;
  drawHistory();
}

byId('loginTab').onclick=()=>setTab(false);
byId('registerTab').onclick=()=>setTab(true);
registerPassword.addEventListener('blur',()=>{if(registerPassword.value)validateRegisterPassword(true);});
registerPassword.addEventListener('input',()=>{if(passwordValidationVisible)validateRegisterPassword();});
byId('forgotPasswordButton').onclick=()=>{
  byId('loginForm').hidden=true;byId('registerForm').hidden=true;byId('verifyForm').hidden=true;
  byId('forgotPasswordForm').hidden=false;byId('resetPasswordForm').hidden=true;message('');
};
document.querySelectorAll('[data-back-to-login]').forEach(button=>button.onclick=showLoginForm);
byId('loginForm').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{await api('/api/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(form))});location.reload();}
  catch(error){message(errorText(error));}
};
byId('registerForm').onsubmit=async event=>{
  event.preventDefault();
  if(!validateRegisterPassword(true)){message('Corrigez le mot de passe : 10 caractères minimum, une majuscule, une minuscule et un chiffre.');registerPassword.focus();return;}
  const form=new FormData(event.currentTarget);const values=Object.fromEntries(form);
  values.email=String(values.email).trim().toLowerCase();values.username=String(values.username).trim().toLowerCase();pendingEmail=values.email;
  try{
    const result=await api('/api/auth/register',{method:'POST',body:JSON.stringify(values)});
    byId('loginForm').hidden=true;byId('registerForm').hidden=true;byId('verifyForm').hidden=false;
    message(result.developmentCode?`Mode développement · code de vérification : ${result.developmentCode}`:'Inscription créée. Vérifiez votre boîte e-mail pour le code à six chiffres.',true);
  }catch(error){message(errorText(error));}
};
byId('verifyForm').onsubmit=async event=>{
  event.preventDefault();const code=new FormData(event.currentTarget).get('code');
  try{
    await api('/api/auth/verify',{method:'POST',body:JSON.stringify({email:pendingEmail,code})});
    setTab(false);message('Adresse vérifiée. Vous pouvez maintenant vous connecter.',true);
  }catch(error){message(errorText(error));}
};
byId('forgotPasswordForm').onsubmit=async event=>{
  event.preventDefault();
  pendingResetEmail=String(new FormData(event.currentTarget).get('email')).trim().toLowerCase();
  try{
    const result=await api('/api/auth/password-reset/request',{method:'POST',body:JSON.stringify({email:pendingResetEmail})});
    byId('forgotPasswordForm').hidden=true;byId('resetPasswordForm').hidden=false;
    message(result.developmentCode?`Mode développement · code de réinitialisation : ${result.developmentCode}`:'Si un compte vérifié correspond à cette adresse, un code a été envoyé.',true);
  }catch(error){message(errorText(error));}
};
byId('resetPasswordForm').onsubmit=async event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
    await api('/api/auth/password-reset/confirm',{method:'POST',body:JSON.stringify({email:pendingResetEmail,code:values.code,password:values.password})});
    showLoginForm();message('Mot de passe modifié. Vous pouvez vous connecter.',true);
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
