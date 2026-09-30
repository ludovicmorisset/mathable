import crypto from 'node:crypto';
import {newState,applyPlacement} from './game/rules.js';

function shuffle(items){
  for(let index=items.length-1;index>0;index--){
    const swap=Math.floor(Math.random()*(index+1));
    [items[index],items[swap]]=[items[swap],items[index]];
  }
  return items;
}

function initialGameState(){
  const state=newState();
  state.bag=shuffle(state.bag);
  for(const hand of state.hands){
    while(hand.length<7&&state.bag.length)hand.push(state.bag.pop());
  }
  state.passed=[false,false];
  return state;
}

function cookieValue(cookie,name){
  return cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1);
}

function publicState(state,seat,mode,code,players){
  return {...state,bag:[],bagCount:state.bag.length,hands:state.hands.map((hand,index)=>index===seat?hand:hand.map(()=>null)),mode,code,seat,players};
}

export function registerSocialApi(app,{pool,auth}){
  app.get('/api/me',auth,async(req,res)=>{
    const result=await pool.query('SELECT id,username,email FROM users WHERE id=$1',[req.user.id]);
    res.json(result.rows[0]||null);
  });

  app.get('/api/friends',auth,async(req,res)=>{
    const result=await pool.query(`SELECT f.user_id,f.friend_id,f.requested_by,f.status,f.created_at,
      CASE WHEN f.user_id=$1 THEN other.username ELSE sender.username END AS username,
      CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END AS other_id,
      (f.requested_by=$1) AS sent
      FROM friendships f
      JOIN users other ON other.id=CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END
      JOIN users sender ON sender.id=f.requested_by
      WHERE f.user_id=$1 OR f.friend_id=$1
      ORDER BY f.status,f.created_at`,[req.user.id]);
    res.json(result.rows);
  });

  app.post('/api/friends/requests',auth,async(req,res)=>{
    const username=String(req.body.username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(username))return res.status(400).json({error:'pseudo_invalide'});
    const target=await pool.query('SELECT id FROM users WHERE lower(username)=$1 AND verified=true',[username]);
    if(!target.rowCount||target.rows[0].id===req.user.id)return res.status(404).json({error:'joueur_introuvable'});
    const existing=await pool.query('SELECT status FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)',[req.user.id,target.rows[0].id]);
    if(existing.rowCount)return res.status(409).json({error:existing.rows[0].status==='accepted'?'deja_amis':'demande_existante'});
    await pool.query('INSERT INTO friendships(user_id,friend_id,requested_by,status) VALUES($1,$2,$1,\'pending\')',[req.user.id,target.rows[0].id]);
    res.status(201).json({ok:true});
  });

  app.post('/api/friends/requests/:userId/accept',auth,async(req,res)=>{
    const result=await pool.query(`UPDATE friendships SET status='accepted'
      WHERE user_id=$1 AND friend_id=$2 AND status='pending' AND requested_by=$1 RETURNING user_id`,[req.params.userId,req.user.id]);
    if(!result.rowCount)return res.status(404).json({error:'demande_introuvable'});
    res.json({ok:true});
  });

  app.delete('/api/friends/:userId',auth,async(req,res)=>{
    await pool.query('DELETE FROM friendships WHERE ((user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)) AND (status=\'accepted\' OR requested_by=$1)',[req.user.id,req.params.userId]);
    res.json({ok:true});
  });

  app.get('/api/games',auth,async(req,res)=>{
    const result=await pool.query(`SELECT g.id,g.code,g.mode,g.updated_at,
      array_agg(u.username ORDER BY gp.seat) AS players
      FROM games g JOIN game_players gp ON gp.game_id=g.id JOIN users u ON u.id=gp.user_id
      WHERE g.id IN (SELECT game_id FROM game_players WHERE user_id=$1)
      GROUP BY g.id ORDER BY g.updated_at DESC`,[req.user.id]);
    res.json(result.rows);
  });

  app.post('/api/games',auth,async(req,res)=>{
    const username=String(req.body.friend||'').trim().toLowerCase();
    const mode=req.body.mode==='simultaneous'?'simultaneous':'turn';
    if(!username)return res.status(400).json({error:'ami_requis'});
    const result=await pool.query(`SELECT u.id FROM users u JOIN friendships f
      ON f.status='accepted' AND ((f.user_id=$1 AND f.friend_id=u.id) OR (f.friend_id=$1 AND f.user_id=u.id))
      WHERE lower(u.username)=$2 AND u.verified=true`,[req.user.id,username]);
    if(!result.rowCount)return res.status(404).json({error:'ami_introuvable'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const code=crypto.randomBytes(3).toString('hex').toUpperCase();
      const state=initialGameState();
      const game=await client.query('INSERT INTO games(code,state,mode,created_by) VALUES($1,$2,$3,$4) RETURNING id,code,mode',[code,JSON.stringify(state),mode,req.user.id]);
      await client.query('INSERT INTO game_players(game_id,user_id,seat) VALUES($1,$2,0),($1,$3,1)',[game.rows[0].id,req.user.id,result.rows[0].id]);
      await client.query('COMMIT');
      res.status(201).json(game.rows[0]);
    }catch(error){
      await client.query('ROLLBACK');
      res.status(500).json({error:'creation_partie_impossible'});
    }finally{client.release();}
  });

  app.post('/api/games/join',auth,async(req,res)=>{
    const code=String(req.body.code||'').trim().toUpperCase();
    const game=await pool.query(`SELECT g.id,g.code,g.mode,gp.seat FROM games g
      JOIN game_players gp ON gp.game_id=g.id AND gp.user_id=$2 WHERE g.code=$1`,[code,req.user.id]);
    if(!game.rowCount)return res.status(404).json({error:'invitation_introuvable'});
    res.json(game.rows[0]);
  });
}

export function registerGameSockets(io,{pool,sessions}){
  io.use((socket,next)=>{
    const sid=cookieValue(socket.handshake.headers.cookie,'mathable_session');
    const user=sid&&sessions.get(sid);
    if(!user)return next(new Error('authentification_requise'));
    socket.data.userId=user.id;
    next();
  });

  async function sendState(gameId){
    const connected=await io.in(gameId).fetchSockets();
    const result=await pool.query(`SELECT g.code,g.mode,g.state,gp.seat,u.username
      FROM games g JOIN game_players gp ON gp.game_id=g.id JOIN users u ON u.id=gp.user_id
      WHERE g.id=$1 ORDER BY gp.seat`,[gameId]);
    if(!result.rowCount)return;
    const {code,mode,state}=result.rows[0];
    const players=result.rows.map(row=>row.username);
    for(const member of connected){
      const seat=member.data.gameSeats?.[gameId];
      if(seat===undefined)continue;
      member.emit('game:state',publicState(state,seat,mode,code,players));
    }
  }

  io.on('connection',socket=>{
    socket.data.gameSeats={};

    socket.on('game:join',async({code}={})=>{
      const result=await pool.query(`SELECT g.id,g.code,g.mode,g.state,gp.seat,gp.user_id,u.username
        FROM games g JOIN game_players gp ON gp.game_id=g.id JOIN users u ON u.id=gp.user_id
        WHERE g.code=$1 AND g.id IN (SELECT game_id FROM game_players WHERE user_id=$2) ORDER BY gp.seat`,[String(code||'').toUpperCase(),socket.data.userId]);
      if(result.rowCount!==2){socket.emit('game:error',{error:'partie_introuvable'});return;}
      const gameId=result.rows[0].id;
      socket.join(gameId);
      const own=result.rows.find(row=>row.user_id===socket.data.userId);
      if(!own){socket.emit('game:error',{error:'partie_introuvable'});return;}
      socket.data.gameSeats[gameId]=own.seat;
      socket.emit('game:state',publicState(result.rows[0].state,own.seat,result.rows[0].mode,result.rows[0].code,result.rows.map(row=>row.username)));
      await sendState(gameId);
    });

    async function updateGame(payload,action){
      const code=String(payload?.code||'').toUpperCase();
      const client=await pool.connect();
      let gameId;
      try{
        await client.query('BEGIN');
        const result=await client.query(`SELECT g.id,g.code,g.mode,g.state,gp.seat FROM games g
          JOIN game_players gp ON gp.game_id=g.id WHERE g.code=$1 AND gp.user_id=$2 FOR UPDATE OF g`,[code,socket.data.userId]);
        if(!result.rowCount)throw new Error('partie_introuvable');
        const game=result.rows[0];
        gameId=game.id;
        const state=game.state;
        const seat=game.seat;
        if(state.gameOver)throw new Error('partie_terminee');
        await action({client,game,state,seat});
        await client.query('UPDATE games SET state=$1,updated_at=now() WHERE id=$2',[JSON.stringify(state),gameId]);
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        socket.emit('game:error',{error:error.message==='partie_introuvable'?error.message:'coup_invalide'});
        return;
      }finally{client.release();}
      await sendState(gameId);
    }

    socket.on('game:place',payload=>updateGame(payload,async({game,state,seat})=>{
      if(game.mode==='turn'&&state.active!==seat)throw new Error('tour_invalide');
      const value=Number(payload?.v);
      if(!Number.isInteger(value)||!state.hands[seat].includes(value))throw new Error('tuile_invalide');
      const move=applyPlacement(state,seat,Number(payload.r),Number(payload.c),value);
      if(!move.ok)throw new Error('placement_invalide');
      state.passed=[false,false];
      if(game.mode==='simultaneous'){
        while(state.hands[seat].length<7&&state.bag.length)state.hands[seat].push(state.bag.pop());
      }
      if(!state.bag.length&&!state.hands[seat].length)state.gameOver=true;
    }));

    socket.on('game:end-turn',payload=>updateGame(payload,async({game,state,seat})=>{
      if(game.mode!=='turn'||state.active!==seat)throw new Error('tour_invalide');
      while(state.hands[seat].length<7&&state.bag.length)state.hands[seat].push(state.bag.pop());
      state.active=1-seat;
      state.passed=[false,false];
      if(!state.bag.length&&state.hands[seat].length===0)state.gameOver=true;
    }));

    socket.on('game:pass',payload=>updateGame(payload,async({game,state,seat})=>{
      if(game.mode==='turn'&&state.active!==seat)throw new Error('tour_invalide');
      state.passed??=[false,false];
      state.passed[seat]=true;
      if(game.mode==='turn'){
        while(state.hands[seat].length<7&&state.bag.length)state.hands[seat].push(state.bag.pop());
        state.active=1-seat;
      }
      if(state.passed.every(Boolean)&&!state.bag.length)state.gameOver=true;
    }));
  });
}
