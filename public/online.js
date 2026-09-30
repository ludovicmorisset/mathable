'use strict';

(()=>{
  const $=id=>document.getElementById(id);
  const code=new URLSearchParams(location.search).get('code')?.toUpperCase();
  const board=$('onlineBoard');
  const specialCells={
    x3:[[0,0],[0,6],[0,7],[0,13],[13,0],[13,6],[13,7],[13,13],[6,0],[7,0],[6,13],[7,13]],
    x2:[[1,1],[2,2],[3,3],[4,4],[1,12],[2,11],[3,10],[4,9],[9,4],[10,3],[11,2],[12,1],[9,9],[10,10],[11,11],[12,12]],
    '÷':[[1,4],[1,9],[4,1],[4,12],[9,1],[9,12],[12,4],[12,9]],
    '−':[[2,5],[2,8],[5,2],[5,11],[8,2],[8,11],[11,5],[11,8]],
    '+':[[3,6],[4,7],[6,4],[7,3],[6,10],[7,9],[9,6],[10,7]],
    '×':[[3,7],[4,6],[6,3],[7,4],[6,9],[7,10],[9,7],[10,6]]
  };
  const starters=[[6,6],[6,7],[7,6],[7,7]];
  let state=null;
  let selected=null;
  const socket=io({autoConnect:false});

  function squareType(row,col){
    for(const [type,cells] of Object.entries(specialCells))if(cells.some(cell=>cell[0]===row&&cell[1]===col))return type;
    return row>=6&&row<=7&&col>=6&&col<=7?'center':'normal';
  }
  function status(text,isError=false){$('onlineStatus').textContent=text;$('onlineStatus').classList.toggle('error',isError);}
  function activeForMe(){return state.mode==='simultaneous'||state.active===state.seat;}
  function render(){
    if(!state)return;
    $('gameTitle').textContent=`${state.players[0]} contre ${state.players[1]}`;
    $('gameCode').textContent=state.code;
    $('bagLabel').textContent=`Sac · ${state.bagCount}`;
    $('name0').textContent=state.players[0];$('name1').textContent=state.players[1];
    $('points0').textContent=state.scores[0];$('points1').textContent=state.scores[1];
    $('score0').classList.toggle('active',state.mode==='turn'&&state.active===0);
    $('score1').classList.toggle('active',state.mode==='turn'&&state.active===1);
    if(state.gameOver)$('turnLabel').textContent='Partie terminée';
    else if(state.mode==='simultaneous')$('turnLabel').textContent=state.passed?.[state.seat]?'Vous avez passé':'Coups simultanés';
    else $('turnLabel').textContent=state.active===state.seat?'Votre tour':`Tour de ${state.players[state.active]}`;
    $('gameHelp').textContent=state.mode==='simultaneous'?'Jouez quand vous le souhaitez. Après chaque coup, votre chevalet est complété.':'Posez une ou plusieurs tuiles, puis terminez votre tour.';
    $('turnButton').textContent=state.mode==='simultaneous'?'Passer':'Terminer mon tour';
    $('turnButton').disabled=state.gameOver||(state.mode==='turn'&&state.active!==state.seat);
    $('handCount').textContent=`(${state.hands[state.seat].length}/7)`;
    renderHand();renderBoard();
  }
  function renderHand(){
    const hand=$('onlineHand');hand.replaceChildren();
    state.hands[state.seat].forEach((value,index)=>{
      const tile=document.createElement('button');tile.type='button';tile.textContent=value;
      tile.classList.toggle('selected',selected===index);
      tile.disabled=state.gameOver||!activeForMe();
      tile.setAttribute('aria-label',`Tuile ${value}${selected===index?', sélectionnée':''}`);
      tile.onclick=()=>{selected=selected===index?null:index;renderHand();};
      hand.append(tile);
    });
  }
  function renderBoard(){
    board.replaceChildren();
    for(let row=0;row<14;row++)for(let col=0;col<14;col++){
      const type=squareType(row,col),value=state.board[row][col];
      const cell=document.createElement('button');cell.type='button';cell.className=`online-cell ${type==='+'||type==='−'||type==='×'||type==='÷'?'op':type}`;
      cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',`Ligne ${row+1}, colonne ${col+1}${value===null?'':`, tuile ${value}`}`);
      if(value!==null){
        const tile=document.createElement('span');tile.className='online-tile';tile.textContent=value;cell.append(tile);
      }else{
        if(type==='x2')cell.textContent='2×';else if(type==='x3')cell.textContent='3×';else if(type==='+'||type==='−'||type==='×'||type==='÷')cell.textContent=type;
        cell.disabled=state.gameOver||selected===null||!activeForMe();
        cell.onclick=()=>{
          if(selected===null)return;
          socket.emit('game:place',{code:state.code,r:row,c:col,v:state.hands[state.seat][selected]});
          selected=null;renderHand();
        };
      }
      if(value!==null&&starters.some(cell=>cell[0]===row&&cell[1]===col))cell.classList.add('center');
      board.append(cell);
    }
  }

  $('turnButton').onclick=()=>socket.emit(state.mode==='turn'?'game:end-turn':'game:pass',{code});
  socket.on('connect',()=>socket.emit('game:join',{code}));
  socket.on('game:state',next=>{state=next;selected=null;render();status('');});
  socket.on('game:error',error=>status(({partie_introuvable:'Partie introuvable ou accès non autorisé.',partie_terminee:'Cette partie est terminée.',coup_invalide:'Ce coup est invalide ou ce n’est pas votre tour.'})[error.error]||'Action impossible.',true));
  socket.on('connect_error',()=>status('Connexion refusée. Connectez-vous avec le compte invité.',true));

  if(!code){status('Code de partie manquant.',true);return;}
  fetch('/api/me').then(response=>{if(!response.ok)throw new Error('auth');return response.json();}).then(()=>socket.connect()).catch(()=>{location.href='/account.html';});
})();
