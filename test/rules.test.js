import test from 'node:test';import assert from 'node:assert/strict';import {makeBag,newState,validatePlacement} from '../server/src/game/rules.js';import {renderBoardPng} from '../server/src/game/board-image.js';
test('sac: 106 tuiles',()=>assert.equal(makeBag().length,106));
test('capture du plateau produite en PNG sans exposer les chevalets',()=>{const state=newState();const image=renderBoardPng(state.board);assert.equal(image.subarray(1,4).toString(),'PNG');assert.equal(image.readUInt32BE(16),434);assert.equal(image.readUInt32BE(20),434)});
test('capture du plateau refuse un plateau invalide',()=>assert.throws(()=>renderBoardPng([]),/Plateau invalide/));
test('plateau et cases obligatoires',()=>{const s=newState();assert.equal(s.board[6][6],1);assert.equal(validatePlacement(s,1,4,3).reason,'operation_invalide')});
test('coup addition valide',()=>{const s=newState();const q=validatePlacement(s,6,8,3);assert.equal(q.ok,true);assert.equal(q.points,3)});
test('multiplicateur x3',()=>{const s=newState();s.board[0][1]=2;s.board[0][2]=1;const q=validatePlacement(s,0,0,3);assert.equal(q.ok,true);assert.equal(q.points,9)});
test('une case opération ne compte que les équations de son opération',()=>{const s=newState();s.board[2][6]=1;s.board[1][6]=2;s.board[3][5]=4;s.board[3][4]=1;const q=validatePlacement(s,3,6,3);assert.equal(q.ok,true);assert.equal(q.points,3)});
