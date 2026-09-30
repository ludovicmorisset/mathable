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

function fixture(mode='turn'){
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
          if(sql.startsWith('UPDATE games SET state')){game.state=JSON.parse(params[0]);return {rowCount:1,rows:[]};}
          return {rowCount:0,rows:[]};
        },
        release(){}
      };
    }
  };
  registerGameSockets(io,{pool,sessions});
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
