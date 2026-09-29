import {AbsoluteFill,Img,staticFile,useCurrentFrame,spring} from 'remotion';
import {k,lin,Stage} from './core';

export const Proof=()=>{
 const f=useCurrentFrame();
 const retreat=k(f,126,142,0,1);
 return <Stage>
  <div style={{position:'absolute',left:90,top:72,fontSize:60,fontWeight:550,letterSpacing:-2,overflow:'hidden'}}>{Array.from('满 100 元，就该免运费。').map((c,i)=><span key={i} style={{display:'inline-block',whiteSpace:'pre',translate:`0 ${k(f,2+i*.45,13+i*.45,78,0)}px`}}>{c}</span>)}</div>
  <div style={{position:'absolute',right:90,top:94,fontSize:24,color:'#647367',opacity:k(f,12,24),translate:`${k(f,12,28,24,0)}px 0`}}>真实 Chrome 页面 · 受控样例</div>
  {[{x:80,at:2,file:'acc-03-qty5-ship-freeship-1.png',label:'修复前',amount:'5.00',color:'#b54e39'},
    {x:980,at:15,file:'fixed-acc-03-qty5-ship-freeship.png',label:'修复后',amount:'0.00',color:'#256a50'}].map(({x,at,file,label,amount,color},i)=>{
    const p=spring({fps:25,frame:f-at,config:{damping:22,stiffness:175,mass:.85},durationInFrames:29});
    const drift=lin(f,50,125,0,1);
    const focus=1+.14*k(f,43,86)-.14*k(f,111,142);
    return <div key={file} style={{position:'absolute',left:x,top:194,width:860,opacity:k(f,at,at+9),transform:`translate3d(${(1-p)*(i?235:-235)+(i?1:-1)*drift*5}px,${(1-p)*145-drift*4-retreat*26}px,0) rotate(${(1-p)*(i?3.5:-3.5)}deg) scale(${.79+.21*p+drift*.004-retreat*.025})`,transformOrigin:'50% 55%'}}>
     <div style={{fontSize:31,color,marginBottom:21,fontWeight:600}}>{label}</div>
     <div style={{position:'relative',width:860,height:622.16,overflow:'hidden',borderRadius:13,border:'1px solid #d6d9d0',boxShadow:`0 ${14+(1-p)*26}px ${35+(1-p)*40}px #132f1815`}}>
      <div style={{position:"absolute",inset:0,transform:`scale(${focus})`,transformOrigin:"85% 72%"}}>
      <Img src={staticFile(`live/${file}`)} style={{width:860,height:622.16,display:'block'}}/>
      <div style={{position:'absolute',left:468,top:454,width:285,height:32,border:`2px solid ${color}`,borderRadius:4,clipPath:`inset(0 ${100-k(f,38+i*12,55+i*12,0,100)}% 0 0)`,opacity:k(f,38+i*12,44+i*12)}}/>
      </div>
      {f>at+8&&f<at+42&&<div style={{position:'absolute',top:-100,bottom:-100,width:190,left:lin(f,at+8,at+42,-300,1080),background:'linear-gradient(90deg,transparent,#ffffff55,transparent)',transform:'rotate(-18deg)'}}/>}
     </div>
     <div style={{display:'flex',alignItems:'baseline',gap:22,marginTop:30,color,overflow:'hidden'}}>
      <span style={{fontSize:32,translate:`0 ${k(f,at+18,at+32,80,0)}px`}}>运费</span>
      <span style={{fontSize:66,fontWeight:560,letterSpacing:-2,translate:`0 ${k(f,at+21,at+37,100,0)}px`}}>¥{amount}</span>
      <span style={{fontSize:27,marginLeft:'auto',color:'#667466',opacity:k(f,at+31,at+44)}}>{at===15?'符合需求':'边界错误'}</span>
     </div>
    </div>;
  })}
  {f<30&&<AbsoluteFill style={{pointerEvents:'none',opacity:Math.sin(Math.PI*Math.min(1,f/30))*.16,backgroundImage:'linear-gradient(#c1cfbf77 1px,transparent 1px),linear-gradient(90deg,#c1cfbf77 1px,transparent 1px)',backgroundSize:'160px 135px',maskImage:'linear-gradient(90deg,transparent,black,transparent)'}}/>}
 </Stage>;
};
