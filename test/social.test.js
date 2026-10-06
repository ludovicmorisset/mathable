import test from 'node:test';
import assert from 'node:assert/strict';
import {newState} from '../server/src/game/rules.js';
import {registerGameSockets} from '../server/src/social.js';

class MockSocket{
  constructor(userId){this.data={userId};this.handshake={headers:{cookie:`mathable_session=${userId}`}};this.handlers={};this.messages=[];this.rooms=new Set();}
  on(event,handler){this.handlers[event]=handler;}
  emit(event,payload){this.messages.push({event,payload});}
  join(room){this.rooms.add(room);}
  async send(event,payload){return this.handlers[event](payload);}
  last(event){return this.messages.filter(message=>message.event===event).at(-1)?.payload;}
}

class MockIo{
  constructor(){this.sockets=[];}
  use(handler){this.middleware=handler;}
  on(event,handler){if(event==='connection')this.connection=handler;}
  in(room){return {fetchSockets:async()=>this.sockets.filter(socket=>socket.rooms.has(room))};}
}

function fixture(mode='turn',notifyTurn){
  const gameState=newState();
  gameState.hands=[[3,5],[6,8]];
  const players=[{id:'player-a',user_id:'player-a',seat:0,username:'alice'},{id:'player-b',user_id:'player-b',seat:1,username:'bob'}];
  const game={id:'game-id',code:'ABC123',mode,state:gameState};
  const sessions=new Map([...players.map(player=>[player.id,{id:player.id}]),['intruder',{id:'intruder'}]]);
  const io=new MockIo();
  const pool={
    async query(sql,params){
      if(sql.includes('gp.user_id,u.username')){
        if(params[1]!==players[0].id&&params[1]!==players[1].id)return {rowCount:0,rows:[]};
        return {rowCount:2,rows:players.map(player=>({...player,...game,user_id:player.id}))};
      }
      if(sql.includes('gp.seat,u.username'))return {rowCount:2,rows:players.map(player=>({...player,...game,user_id:player.id}))};
      throw new Error(`Unexpected query: ${sql}`);
    },
    async connect(){
      return {
        async query(sql,params){
          if(sql.startsWith('SELECT g.id,g.code')){
            const player=players.find(item=>item.id===params[1]);
            return player&&params[0]===game.code?{rowCount:1,rows:[{...game,seat:player.seat}]}:{rowCount:0,rows:[]};
          }
          if(sql.startsWith('SELECT user_id FROM game_players')){
            const player=players.find(item=>item.seat===params[1]);
            return player?{rowCount:1,rows:[{user_id:player.id}]}:{rowCount:0,rows:[]};
          }
          if(sql.startsWith('UPDATE games SET state')){game.state=JSON.parse(params[0]);return {rowCount:1,rows:[]};}
          return {rowCount:0,rows:[]};
        },
        release(){}
      };
    }
  };
  registerGameSockets(io,{pool,sessions,notifyTurn});
  function connect(userId){
    const socket=new MockSocket(userId);
    io.sockets.push(socket);
    io.middleware(socket,error=>{if(error)throw error;});
    io.connection(socket);
    return socket;
  }
  return {game,connect};
}

test('une partie privée révèle seulement le chevalet du joueur connecté',async()=>{
  const {connect}=fixture();
  const alice=connect('player-a');
  const bob=connect('player-b');
  const intruder=connect('intruder');
  await alice.send('game:join',{code:'ABC123'});
  await bob.send('game:join',{code:'ABC123'});
  await intruder.send('game:join',{code:'ABC123'});
  assert.equal(intruder.last('game:error').error,'partie_introuvable');
  assert.equal(intruder.rooms.size,0);
  assert.deepEqual(alice.last('game:state').hands[0],[3,5]);
  assert.deepEqual(alice.last('game:state').hands[1],[null,null]);
  assert.deepEqual(bob.last('game:state').hands[0],[null,null]);
  assert.deepEqual(bob.last('game:state').hands[1],[6,8]);
});

test('le serveur refuse un coup hors tour et accepte le coup du joueur actif',async()=>{
  const {game,connect}=fixture();
  const alice=connect('player-a');
  const bob=connect('player-b');
  await alice.send('game:join',{code:'ABC123'});
  await bob.send('game:join',{code:'ABC123'});
  await bob.send('game:place',{code:'ABC123',r:6,c:8,v:6});
  assert.equal(bob.last('game:error').error,'coup_invalide');
  assert.equal(game.state.board[6][8],null);
  await alice.send('game:place',{code:'ABC123',r:6,c:8,v:3});
  assert.equal(game.state.board[6][8],3);
  assert.deepEqual(game.state.hands[0],[5]);
  assert.deepEqual(bob.last('game:state').hands[0],[null]);
});

test('un coup est persisté avec son auteur pour le rejouer au chargement',async()=>{
  const {game,connect}=fixture();
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:place',{code:'ABC123',r:6,c:8,v:3});
  assert.deepEqual(game.state.moves,[{id:0,turn:0,seat:0,r:6,c:8,v:3,points:3}]);
  assert.deepEqual(alice.last('game:state').moves,game.state.moves);
});

test('vider son chevalet rapporte 50 points en mode tour par tour',async()=>{
  const {game,connect}=fixture();
  game.state.hands[0]=[3];
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:place',{code:'ABC123',r:6,c:8,v:3});
  assert.equal(game.state.scores[0],53);
  assert.equal(game.state.rackBonusEarned[0],true);
});

test('un joueur peut passer son tour en mode tour par tour',async()=>{
  const {game,connect}=fixture();
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:pass',{code:'ABC123'});
  assert.equal(game.state.active,1);
  assert.equal(game.state.hands[0].length,7);
  assert.equal(game.state.passed[0],true);
});

test('abandonner termine la partie et déduit les tuiles restantes des deux scores',async()=>{
  const {game,connect}=fixture();
  game.state.scores=[24,31];
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:abandon',{code:'ABC123'});
  assert.equal(game.state.gameOver,true);
  assert.equal(game.state.abandoned,true);
  assert.deepEqual(game.state.scores,[16,17]);
  assert.deepEqual(alice.last('game:state').scores,[16,17]);
});

test('un changement de tour notifie le joueur qui doit jouer',async()=>{
  const notifications=[];
  const {connect}=fixture('turn',notification=>notifications.push(notification));
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:end-turn',{code:'ABC123'});
  assert.deepEqual(notifications,[{gameId:'game-id',userId:'player-b'}]);
});

test('un joueur échange plusieurs tuiles et consomme son tour',async()=>{
  const {game,connect}=fixture();
  game.state.hands[0]=[3,5,1,2,4,6,7];
  const alice=connect('player-a');
  const before=[...game.state.bag,...game.state.hands.flat()].sort((a,b)=>a-b);
  const bagCount=game.state.bag.length;
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:exchange',{code:'ABC123',values:[3,5]});
  const after=[...game.state.bag,...game.state.hands.flat()].sort((a,b)=>a-b);
  assert.equal(game.state.active,1);
  assert.equal(game.state.hands[0].length,7);
  assert.equal(game.state.bag.length,bagCount);
  assert.deepEqual(after,before);
  assert.deepEqual(game.state.previousTurnMoves,[]);
});

test('un échange est refusé si le sac ne contient pas assez de tuiles',async()=>{
  const {game,connect}=fixture();
  game.state.bag=[];
  const alice=connect('player-a');
  await alice.send('game:join',{code:'ABC123'});
  await alice.send('game:exchange',{code:'ABC123',values:[3]});
  assert.equal(alice.last('game:error').error,'echange_invalide');
  assert.deepEqual(game.state.hands[0],[3,5]);
  assert.equal(game.state.active,0);
});

test('le serveur conserve les coups du dernier tour terminé seulement',async()=>{
  const {game,connect}=fixture();
  const alice=connect('player-a');
  const bob=connect('player-b');
  game.state.hands[1]=[3,8];
  await alice.send('game:join',{code:'ABC123'});
  await bob.send('game:join',{code:'ABC123'});
  await alice.send('game:place',{code:'ABC123',r:6,c:8,v:3});
  await alice.send('game:end-turn',{code:'ABC123'});
  const aliceTurn=game.state.previousTurnMoves;
  await bob.send('game:place',{code:'ABC123',r:6,c:5,v:3});
  await bob.send('game:end-turn',{code:'ABC123'});
  assert.deepEqual(game.state.previousTurnMoves,[{id:1,turn:1,seat:1,r:6,c:5,v:3,points:3}]);
  assert.notDeepEqual(game.state.previousTurnMoves,aliceTurn);
});

test('les deux sièges peuvent jouer sans attendre en mode simultané',async()=>{
  const {game,connect}=fixture('simultaneous');
  game.state.hands=[[7,5],[3,6]];
  const alice=connect('player-a');
  const bob=connect('player-b');
  await alice.send('game:join',{code:'ABC123'});
  await bob.send('game:join',{code:'ABC123'});
  await bob.send('game:place',{code:'ABC123',r:6,c:8,v:3});
  await alice.send('game:place',{code:'ABC123',r:7,c:8,v:7});
  assert.equal(game.state.board[6][8],3);
  assert.equal(game.state.board[7][8],7);
  assert.equal(game.state.hands[0].length,7);
  assert.equal(game.state.hands[1].length,7);
});
