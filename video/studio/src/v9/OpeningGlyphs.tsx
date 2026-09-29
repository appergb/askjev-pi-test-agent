import {AbsoluteFill} from 'remotion';
import {k,lin,P} from './core';

const slots=[[-229,0,'<'],[229,0,'>'],[-182,-129,'/'],[188,-129,'/'],[-141,129,'/'],[147,129,'/'],[-333,0,'<'],[340,0,'>'],[-73,-228,'/'],[69,230,'/'],[-340,-222,'>'],[330,224,'*'],[-365,177,'/'],[350,-184,'/']] as const;
const pieces=[[-600,-275,'const express();'],[535,-293,'client_id ='],[-622,-19,'can you'],[546,27,'user R340'],[-407,299,'const args'],[557,324,'await askJEV()'],[-510,145,'return result;']] as const;
export const OpeningGlyphs=({f}:{f:number})=><AbsoluteFill>
 {slots.map(([x,y,s],i)=>{const at=i<2?15:23+(i-2)*1.25;const expansion=lin(f,40,55,1,2.15);return <div key={i} style={{position:'absolute',left:960+x*expansion,top:538+y*expansion,translate:'-50% -50%',fontFamily:'Menlo',fontSize:39,color:i%5===2?P.orange:i%5===4?'#c3aad5':'#4a4d45',opacity:k(f,at,at+3)*k(f,43+i*.2,49+i*.2,1,0)}}>{i<2&&f<21?'/':s}</div>})}
 {pieces.map(([x,y,s],i)=>{const at=40+i*1.35;return <div key={s} style={{position:'absolute',left:960+x*lin(f,at,56,.9,1.12),top:538+y*lin(f,at,56,.9,1.12),translate:'-50% -50%',fontSize:25,fontFamily:'Menlo',letterSpacing:.1,whiteSpace:'nowrap',color:i%3===1?'#ae9068':'#65645e',opacity:k(f,at,at+2)}}>{s.slice(0,Math.floor(lin(f,at,at+6,0,s.length)))}<span style={{opacity:f<at+6?1:0}}>▏</span></div>})}
 </AbsoluteFill>;
