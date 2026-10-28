import {deflateSync} from 'node:zlib';
import {BOARD_SIZE,special} from './rules.js';

const CELL=28;
const GAP=2;
const PAD=8;
const SIZE=PAD*2+BOARD_SIZE*CELL+(BOARD_SIZE-1)*GAP;
const COLORS={background:[21,101,192],grid:[13,71,161],normal:[255,255,255],x2:[126,87,194],yellow:[255,213,79],operation:[13,71,161],tile:[255,248,201],tileBorder:[166,111,0],ink:[23,43,58],white:[255,255,255]};
const FONT={
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['111','001','111','100','111'],'3':['111','001','111','001','111'],'4':['101','101','111','001','001'],'5':['111','100','111','001','111'],'6':['111','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','111'],'+':['000','010','111','010','000'],'−':['000','000','111','000','000'],'×':['101','010','010','010','101'],'÷':['010','000','111','000','010']
};

function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}
  return (crc^0xffffffff)>>>0;
}

function chunk(type,data){
  const name=Buffer.from(type);
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,checksum]);
}

export function renderBoardPng(board){
  if(!Array.isArray(board)||board.length!==BOARD_SIZE||board.some(row=>!Array.isArray(row)||row.length!==BOARD_SIZE))throw new TypeError('Plateau invalide');
  const pixels=Buffer.alloc(SIZE*SIZE*3);
  const fill=(x,y,width,height,color)=>{
    for(let row=Math.max(0,y);row<Math.min(SIZE,y+height);row++)for(let col=Math.max(0,x);col<Math.min(SIZE,x+width);col++){
      const offset=(row*SIZE+col)*3;
      pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];
    }
  };
  const drawText=(text,x,y,scale,color)=>{
    const glyphs=[...String(text)].map(char=>FONT[char]||[]);
    const width=glyphs.reduce((total,glyph)=>total+(glyph[0]?.length||0)*scale,0)+(glyphs.length-1)*scale;
    let left=x-Math.floor(width/2);
    for(const glyph of glyphs){
      for(let row=0;row<glyph.length;row++)for(let col=0;col<glyph[row].length;col++)if(glyph[row][col]==='1')fill(left+col*scale,y+row*scale,scale,scale,color);
      left+=(glyph[0]?.length||0)*scale+scale;
    }
  };
  fill(0,0,SIZE,SIZE,COLORS.background);
  for(let row=0;row<BOARD_SIZE;row++)for(let col=0;col<BOARD_SIZE;col++){
    const x=PAD+col*(CELL+GAP),y=PAD+row*(CELL+GAP),type=special(row,col),value=board[row][col];
    fill(x,y,CELL,CELL,COLORS.grid);
    fill(x+1,y+1,CELL-2,CELL-2,type==='x2'?COLORS.x2:type==='x3'||type==='center'?COLORS.yellow:type==='+'||type==='−'||type==='×'||type==='÷'?COLORS.operation:COLORS.normal);
    if(value!==null){
      fill(x+3,y+3,CELL-6,CELL-6,COLORS.tileBorder);
      fill(x+4,y+4,CELL-8,CELL-8,COLORS.tile);
      drawText(value,x+CELL/2,y+CELL/2-5,2,COLORS.ink);
    }else if(type==='x2'||type==='x3')drawText(type==='x2'?'2':'3',x+CELL/2,y+CELL/2-2,2,type==='x2'?COLORS.white:COLORS.ink);
    else if(type==='+'||type==='−'||type==='×'||type==='÷')drawText(type,x+CELL/2,y+CELL/2-5,2,COLORS.white);
  }
  const raw=Buffer.alloc((SIZE*3+1)*SIZE);
  for(let row=0;row<SIZE;row++)pixels.copy(raw,row*(SIZE*3+1)+1,row*SIZE*3,(row+1)*SIZE*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(SIZE,0);header.writeUInt32BE(SIZE,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
