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
  const requiredOperations={'+':'addition','−':'soustraction','×':'multiplication','÷':'division'};
  let state=null;
  let selected=null;
  let exchangeMode=false;
  const selectedForExchange=new Set();
  const revealedOpponentMoves=new Set();
  const seenOpponentMoves=new Set();
  const animatedOpponentMoves=new Set();
  const pendingOpponentMoves=[];
  let replayTimer=null;
  let activeOpponentMove=null;
  let replayInitialized=false;
  const socket=io({autoConnect:false});

  function squareType(row,col){
    for(const [type,cells] of Object.entries(specialCells))if(cells.some(cell=>cell[0]===row&&cell[1]===col))return type;
    return row>=6&&row<=7&&col>=6&&col<=7?'center':'normal';
  }
  function validEquations(row,col,value){
    const equations=[];
    for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const first=state.board[row+dr]?.[col+dc],second=state.board[row+2*dr]?.[col+2*dc];
      if(typeof first!=='number'||typeof second!=='number')continue;
      const types=[];
      if(value===first+second)types.push('addition');
      if(value===Math.abs(first-second))types.push('soustraction');
      if(value===first*second)types.push('multiplication');
      if((second!==0&&first%second===0&&value===first/second)||(first!==0&&second%first===0&&value===second/first))types.push('division');
      if(types.length)equations.push({types});
    }
    return equations;
  }
  function placementAt(row,col,value){
    if(row<0||row>=14||col<0||col>=14||state.board[row][col]!==null)return null;
    const type=squareType(row,col),required=requiredOperations[type],equations=validEquations(row,col,value);
    const scoringEquations=required?equations.filter(equation=>equation.types.includes(required)):equations;
    if(!scoringEquations.length)return null;
    return {points:value*scoringEquations.length*(type==='x2'?2:type==='x3'?3:1)};
  }
  function hasPossibleMove(){
    return state.hands[state.seat].some(value=>{
      for(let row=0;row<14;row++)for(let col=0;col<14;col++)if(placementAt(row,col,value))return true;
      return false;
    });
  }
  function moveId(move,index){return String(move.id??`${move.seat}-${move.r}-${move.c}-${index}`);}
  function replayNextOpponentMove(){
    if(!pendingOpponentMoves.length)return;
    const move=pendingOpponentMoves.shift();
    revealedOpponentMoves.add(move.id);
    activeOpponentMove=move.id;
    renderBoard();
    replayTimer=window.setTimeout(()=>{
      replayTimer=null;
      activeOpponentMove=null;
      replayNextOpponentMove();
    },450);
  }
  function queueOpponentMoves(next){
    const moves=next.moves||[];
    if(!replayInitialized){
      replayInitialized=true;
      const previousTurnIds=new Set((next.previousTurnMoves||[]).map((move,index)=>moveId(move,index)));
      for(const [index,move] of moves.entries()){
        const id=moveId(move,index);
        seenOpponentMoves.add(id);
        if(move.seat===next.seat||!previousTurnIds.has(id))continue;
        animatedOpponentMoves.add(id);
        pendingOpponentMoves.push({...move,id});
      }
    }else{
      for(const [index,move] of moves.entries()){
        if(move.seat===next.seat)continue;
        const id=moveId(move,index);
        if(seenOpponentMoves.has(id))continue;
        seenOpponentMoves.add(id);
        animatedOpponentMoves.add(id);
        pendingOpponentMoves.push({...move,id});
      }
    }
    if(replayTimer===null)replayNextOpponentMove();
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
    const noPossibleMove=!state.gameOver&&activeForMe()&&!hasPossibleMove();
    $('gameHelp').textContent=state.gameOver?'Partie terminée. Les tuiles restantes ont été déduites des scores.':exchangeMode?'Sélectionnez les tuiles à remplacer, puis confirmez l’échange.':noPossibleMove?state.bagCount?'Aucun coup possible avec votre chevalet. Échangez des tuiles ou passez votre tour.':'Aucun coup possible avec votre chevalet. Passez votre tour.':state.mode==='simultaneous'?'Jouez quand vous le souhaitez ou échangez des tuiles. Après chaque coup, votre chevalet est complété.':'Posez des tuiles, échangez-en avant de jouer, ou passez votre tour.';
    $('turnButton').textContent=state.mode==='simultaneous'?'Passer':'Terminer mon tour';
    $('turnButton').disabled=state.gameOver||exchangeMode||(state.mode==='turn'&&state.active!==state.seat);
    $('exchangeButton').textContent=exchangeMode?(selectedForExchange.size?`Confirmer l’échange (${selectedForExchange.size})`:'Annuler l’échange'):'Échanger des tuiles';
    $('exchangeButton').disabled=state.gameOver||!activeForMe()||(!exchangeMode&&state.bagCount===0)||(state.mode==='turn'&&(state.active!==state.seat||(state.turnMoves||[]).length>0));
    $('passButton').hidden=state.mode==='simultaneous';
    $('passButton').disabled=state.gameOver||exchangeMode||(state.mode==='turn'&&state.active!==state.seat);
    $('abandonButton').disabled=state.gameOver;
    $('handCount').textContent=`(${state.hands[state.seat].length}/7)`;
    renderHand();renderBoard();
  }
  function renderHand(){
    const hand=$('onlineHand');hand.replaceChildren();
    state.hands[state.seat].forEach((value,index)=>{
      const tile=document.createElement('button');tile.type='button';tile.textContent=value;
      tile.classList.toggle('selected',!exchangeMode&&selected===index);
      tile.classList.toggle('exchange-selected',exchangeMode&&selectedForExchange.has(index));
      tile.disabled=state.gameOver||!activeForMe();
      tile.setAttribute('aria-label',`Tuile ${value}${exchangeMode&&selectedForExchange.has(index)?', sélectionnée pour échange':selected===index?', sélectionnée':''}`);
      tile.onclick=()=>{
        if(exchangeMode){
          if(selectedForExchange.has(index))selectedForExchange.delete(index);
          else if(selectedForExchange.size>=state.bagCount){status('Le sac ne contient pas assez de tuiles.',true);return;}
          else selectedForExchange.add(index);
        }else selected=selected===index?null:index;
        render();
      };
      hand.append(tile);
    });
  }
  function renderBoard(){
    board.replaceChildren();
    const previousOpponentMoveIds=new Set((state.previousTurnMoves||[]).map((move,index)=>({move,id:moveId(move,index)})).filter(({move})=>move.seat!==state.seat).map(({id})=>id));
    const opponentMovesAt=new Map((state.moves||[]).map((move,index)=>({move,id:moveId(move,index)})).filter(({id})=>previousOpponentMoveIds.has(id)).map(({move,id})=>[`${move.r},${move.c}`,id]));
    for(let row=0;row<14;row++)for(let col=0;col<14;col++){
      const type=squareType(row,col),value=state.board[row][col];
      const opponentMoveId=opponentMovesAt.get(`${row},${col}`);
      const waitingForOpponentMove=opponentMoveId!==undefined&&!revealedOpponentMoves.has(opponentMoveId);
      const cell=document.createElement('button');cell.type='button';cell.className=`online-cell ${type==='+'||type==='−'||type==='×'||type==='÷'?'op':type}`;
      if(opponentMoveId!==undefined)cell.classList.add('last-opponent-turn');
      cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',waitingForOpponentMove?`Ligne ${row+1}, colonne ${col+1}, coup adverse en cours de chargement`:`Ligne ${row+1}, colonne ${col+1}${value===null?'':`, tuile ${value}`}`);
      if(value!==null&&!waitingForOpponentMove){
        const tile=document.createElement('span');tile.className='online-tile';tile.textContent=value;
        if(opponentMoveId===activeOpponentMove)tile.classList.add('opponent-arrival');
        cell.append(tile);
      }else{
        if(type==='x2')cell.textContent='2×';else if(type==='x3')cell.textContent='3×';else if(type==='+'||type==='−'||type==='×'||type==='÷')cell.textContent=type;
        cell.disabled=exchangeMode||waitingForOpponentMove||state.gameOver||selected===null||!activeForMe();
        if(!waitingForOpponentMove)cell.onclick=()=>{
            if(selected===null)return;
            const value=state.hands[state.seat][selected];
            if(!placementAt(row,col,value)){status('Placement invalide.',true);return;}
            socket.emit('game:place',{code:state.code,r:row,c:col,v:value});
            selected=null;render();status('');
          };
      }
      if(value!==null&&starters.some(cell=>cell[0]===row&&cell[1]===col))cell.classList.add('center');
      board.append(cell);
    }
  }

  $('turnButton').onclick=()=>socket.emit(state.mode==='turn'?'game:end-turn':'game:pass',{code});
  $('passButton').onclick=()=>socket.emit('game:pass',{code});
  $('abandonButton').onclick=()=>{if(window.confirm('Abandonner cette partie ? Les tuiles restantes seront déduites des scores des deux joueurs.'))socket.emit('game:abandon',{code});};
  $('exchangeButton').onclick=()=>{
    if(!exchangeMode){exchangeMode=true;selected=null;selectedForExchange.clear();render();status('Choisissez une ou plusieurs tuiles à échanger.');return;}
    if(!selectedForExchange.size){exchangeMode=false;render();status('');return;}
    if(selectedForExchange.size>state.bagCount){status('Le sac ne contient pas assez de tuiles.',true);return;}
    const values=[...selectedForExchange].map(index=>state.hands[state.seat][index]);
    socket.emit('game:exchange',{code:state.code,values});
    exchangeMode=false;selectedForExchange.clear();selected=null;render();status('');
  };
  socket.on('connect',()=>socket.emit('game:join',{code}));
  socket.on('game:state',next=>{state=next;selected=null;exchangeMode=false;selectedForExchange.clear();render();status('');queueOpponentMoves(next);});
  socket.on('game:error',error=>{render();status(({partie_introuvable:'Partie introuvable ou accès non autorisé.',partie_terminee:'Cette partie est terminée.',coup_invalide:'Action invalide ou ce n’est pas votre tour.',echange_invalide:'Échange impossible. Vérifiez les tuiles sélectionnées et le contenu du sac.'})[error.error]||'Action impossible.',true)});
  socket.on('connect_error',()=>status('Connexion refusée. Connectez-vous avec le compte invité.',true));

  if(!code){status('Code de partie manquant.',true);return;}
  fetch('/api/me').then(response=>{if(!response.ok)throw new Error('auth');return response.json();}).then(()=>socket.connect()).catch(()=>{location.href='/account.html';});
})();
