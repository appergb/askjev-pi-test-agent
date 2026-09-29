import React from 'react';
import {AbsoluteFill} from 'remotion';
import {buttonPose,k,lin,Mark,Spectrum} from './core';

export const TERM={w:1480,h:780,x:220,y:150};
export const INK={text:'#dadbd6',green:'#83e650',bright:'#51e31d',cyan:'#85c9c5',muted:'#777d79',purple:'#c88ad0',orange:'#e8aa70',red:'#e58d86'};
const mono="Menlo, 'Noto Sans SC', monospace";
export const DISPATCH_TARGET:[number,number]=[1499.1,452.7];
export const ISSUE_TARGET:[number,number]=[1323.15,620.1];
export const HEADER_TARGET:[number,number]=[1300,292];
export const subjects=['优惠码','免运费','数量边界','配送方式','门店自提'];
export const timelineBlocks=[
 {x:80,y:220,w:558,s:'普通配送',c:'#85c9c5'},
 {x:80,y:282,w:725,s:'三件商品',c:'#bfa6db'},
 {x:80,y:344,w:995,s:'满 100 元免运费',c:'#e8aa70'},
 {x:80,y:406,w:620,s:'超过免运费门槛',c:'#85c9c5'},
 {x:80,y:468,w:1100,s:'SAVE10 优惠码',c:'#e8aa70'},
 {x:80,y:530,w:780,s:'门店自提',c:'#a9c970'},
];

export const TerminalWindow:React.FC<{children:React.ReactNode;title?:string;width?:number;height?:number;footer?:string;displayScale?:number;style?:React.CSSProperties}>=({children,title='coding agent — checkout',width=TERM.w,height=TERM.h,footer='~/checkout   main',displayScale=.9,style})=><div data-terminal-window style={{position:'relative',width,height,scale:displayScale,borderRadius:21,overflow:'hidden',background:'#10120f',border:'1px solid #454941',boxShadow:'0 27px 80px #2222141a',fontFamily:mono,color:INK.text,...style}}>
 <div style={{position:'absolute',left:0,top:0,right:0,height:45,display:'flex',alignItems:'center',padding:'0 18px',gap:11,background:'linear-gradient(#fff,#ededeb)',color:'#5b5c58',fontFamily:'Inter, sans-serif',fontSize:14.25,fontWeight:560,borderBottom:'1px solid #d1d2cb'}}>{['#ff625b','#ffbd2f','#29c840'].map(c=><span key={c} style={{width:17,height:17,borderRadius:'50%',background:c,boxShadow:'inset 0 0 0 1px #0002'}}/>)}<span style={{marginLeft:14,letterSpacing:-.2}}>▰ &nbsp; {title}</span></div>
 {children}
 {footer&&<div style={{position:'absolute',left:38,right:38,bottom:20,display:'flex',justifyContent:'space-between',fontSize:13.5,color:'#757d72'}}><span>{footer}</span><span style={{color:INK.cyan}}>askJEV</span></div>}
 </div>;

export const Typed:React.FC<{text:string;f:number;start?:number;end?:number;cursor?:boolean}>=({text,f,start=0,end=24,cursor=true})=><>{text.slice(0,Math.floor(lin(f,start,end,0,text.length)))}{cursor&&<span style={{display:'inline-block',height:'1.08em',width:'.49em',marginLeft:5,verticalAlign:'-.15em',background:INK.bright,opacity:f<end+5||Math.floor(f/12)%2===0?1:0}}/>}</>;
export const Prompt:React.FC<{children:React.ReactNode;top:number;size?:number}>=({children,top,size=29})=><div style={{position:'absolute',left:48,right:48,top,padding:'18px 16px',borderTop:`1.5px solid ${INK.purple}`,borderBottom:`1.5px solid ${INK.purple}`,fontSize:size*.75,lineHeight:1.5,color:'#e4e8df'}}><span style={{color:INK.bright,marginRight:18}}>❯</span>{children}</div>;
export const Line:React.FC<{children:React.ReactNode;top:number;left?:number;color?:string;size?:number;opacity?:number}>=({children,top,left=54,color=INK.text,size=27,opacity=1})=><div style={{position:'absolute',left,right:40,top,fontSize:size*.75,lineHeight:1.55,whiteSpace:'pre',color,opacity}}>{children}</div>;

export const Trace:React.FC<{lines:string[];top?:number;left?:number;f?:number;at?:number;size?:number}>=({lines,top,left=54,f=999,at=0,size=15})=><div data-terminal-trace style={{position:top===undefined?'relative':'absolute',top,left:top===undefined?undefined:left,right:35,fontFamily:mono,fontSize:size,lineHeight:'22px',whiteSpace:'pre',color:'#7d8778'}}>{lines.map((line,i)=><div key={line} style={{opacity:k(f,at+i*2,at+i*2+4)}}><span style={{color:i%4===0?'#6cafa4':i%4===2?'#a99a77':undefined}}>{line}</span></div>)}</div>;
const caseFiles=['acc-01-qty1-ship-nocoupon','acc-02-qty3-ship-nocoupon','acc-03-qty5-ship-freeship','acc-04-qty6-ship-nocoupon','acc-05-qty2-ship-save10','acc-06-qty1-pickup-nocoupon'];

// Banner, wording and footer follow src/terminal.mjs and the supplied real TUI.
export const AskBanner:React.FC<{top?:number;small?:boolean}>=({top=77,small=false})=><div style={{position:'absolute',left:45,top,fontFamily:mono}}><div style={{whiteSpace:'pre',fontSize:small?18:26,lineHeight:1,color:'#5fd7af',letterSpacing:0}}>{'█▀█ █▀ █▄▀ ░░█ █▀▀ █░█\n█▀█ ▄█ █░█ █▄█ ██▄ ▀▄▀'}</div><div style={{marginTop:4,fontSize:small?14:18,lineHeight:1.3}}><span style={{color:'#3dff0c',fontWeight:700}}>askJEV</span><span style={{color:'#858585'}}> &nbsp; v1.5.0 · 代码测试与缺陷检查</span></div></div>;
export const AskInput:React.FC<{top:number;f?:number;text?:string;busy?:boolean;width?:number}>=({top,f=0,text='',busy=false})=><div style={{position:'absolute',top,left:24,right:24,fontFamily:mono}}><div style={{padding:'11px 13px',height:56,borderTop:'2px solid #5fd7af',borderBottom:'2px solid #5fd7af',fontSize:19.5,color:'#39ff0a'}}><Typed text={text} f={f} end={23}/></div><div style={{display:'flex',justifyContent:'space-between',fontSize:15.75,color:'#858585',padding:'10px 13px'}}><span>Enter 发送 · /help 帮助</span><span>{busy?'Esc 停止':'就绪'}</span></div></div>;
export const AskJEVTerminal:React.FC<{f?:number;working?:boolean}>=({f=0,working=false})=><TerminalWindow title="askJEV — askjev-cli — checkout" footer="">
 <AskBanner/>
 <Line top={209} left={45} size={24} color="#858585">~/checkout</Line>
 <Line top={287} left={45} size={26} color="#5fd7af">askJEV</Line>
 <div style={{position:'absolute',left:45,right:45,top:331,fontSize:18.75,lineHeight:1.7,color:'#39ff0a'}}>{working?'已读取需求与源码。开始检查优惠码、免运费和配送方式。':'告诉我你要检查什么，并提供 task.json 路径。也可以输入 /run task.json 直接开始测试。'}</div>
 {working&&<Line top={411} left={45} color="#858585" size={24}>⠸ 正在执行测试…</Line>}
 <AskInput top={working?501:442} text={working?'':'/run task.json'} f={f} busy={working}/>
 {!working&&<Trace top={565} f={f} lines={['task.json','  project     ./checkout','  files       index.html  app.js  styles.css  requirements.md','  entry       index.html','  scenarios   shipping / free-shipping / SAVE10 / pickup','  selection   all','  output      runs/checkout']}/>}
 </TerminalWindow>;

export const HostTerminal:React.FC<{f?:number;expanded?:boolean;complete?:boolean;variant?:'codex'|'agent'}>=({f=90,expanded,complete=false,variant='codex'})=>{
 const open=expanded===undefined?k(f,34,51):expanded?1:0;const press=buttonPose(f,29);
 return <TerminalWindow title={variant==='codex'?'Codex — checkout':'coding agent — checkout'}>
  <Line top={81} size={22} color={INK.green}>{variant==='codex'?'>_ Codex':'coding agent'} <span style={{color:INK.muted}}> / ~/checkout</span></Line>
  <Prompt top={137}><Typed f={f} end={22} text="检查优惠码和免运费，修好再测。"/></Prompt>
  <div style={{position:'absolute',left:54,top:255,width:1372,height:74+open*327,borderLeft:'2px solid #af8456',background:'#191c17',overflow:'hidden',opacity:k(f,15,21)}}>
   <div style={{height:74,display:'flex',alignItems:'center',padding:'0 23px',gap:18,fontSize:19.5}}><Mark size={32}/><span style={{color:INK.orange}}>askJEV</span><span style={{fontSize:15.75,color:'#899180'}}>测试 Agent</span><span style={{marginLeft:17,color:INK.cyan,fontSize:17.25}}>run --request task.json --select all</span><div data-ui-target="dispatch" style={{marginLeft:'auto',width:130,height:44,flexShrink:0,textAlign:'center',lineHeight:'44px',fontSize:15.75,background:'#293024',borderRadius:5,color:'#b6cba6',scale:press.scale,translate:`0 ${press.y}px`}}>{open>.5?'▾ 已展开':'▸ 展开'}</div></div>
   <div style={{padding:'15px 30px 25px 49px',fontSize:20.25,lineHeight:1.78,borderTop:'1px solid #32372d',opacity:k(open,0,.5)}}>
    <div><span style={{color:INK.muted}}>├─ </span>读取 <span style={{color:INK.cyan}}>requirements.md</span> · <span style={{color:INK.cyan}}>app.js</span></div>
    <div><span style={{color:INK.muted}}>├─ </span>生成测试：优惠码 / 免运费 / 门店自提</div>
    <div><span style={{color:INK.muted}}>├─ </span>调用 <span style={{color:INK.orange}}>JEV</span> 评分</div>
    <div style={{color:complete?INK.green:INK.cyan}}><span style={{color:INK.muted}}>└─ </span>{complete?'复测完成，结果已返回':'开始测试'}</div>
    <div style={{marginTop:11}}><Trace lines={['  reading    index.html, app.js, styles.css, requirements.md','  planning   qty=1,3,5,6 / ship,pickup / SAVE10','  generating tests/acc-01 … acc-06.browser.json','  scoring    askJEV → candidate-support-v1','  executing  Chrome · isolated project snapshot']}/></div>
   </div>
  </div>
  <Trace top={681} lines={['tool call  askjev run --request task.json --select all','workspace  ./checkout  •  requirements.md  •  app.js']}/>
  {complete&&<Line top={649} size={24} color={INK.green}>✓ coding agent 继续处理下一步</Line>}
 </TerminalWindow>;
};
export const Dashboard:React.FC<{f?:number;complete?:boolean}>=({f=90,complete=false})=><HostTerminal f={f} expanded complete={complete}/>;
export const Dispatch:React.FC<{f:number}>=({f})=><HostTerminal f={f}/>;

export const RoutePanel:React.FC<{f?:number}>=({f=90})=><TerminalWindow title="askJEV — askjev-cli — checkout" footer="">
 <AskBanner top={66} small/>
 <Line top={162} size={24} color={INK.muted}>读取需求与源码</Line>
 <div style={{position:'absolute',left:55,top:213,fontSize:21.75,lineHeight:1.88}}>{[['requirements.md','满 100 元免运费'],['app.js','SAVE10 减免商品金额的 10%'],['index.html','数量 / 配送方式 / 优惠码']].map(([a,b],i)=><div key={a} style={{opacity:k(f,i*6,i*6+10)}}><span style={{color:INK.cyan,display:'inline-block',width:342}}>✓ {a}</span><span>{b}</span></div>)}</div>
 <div style={{position:'absolute',left:55,right:55,top:440,borderTop:'1px solid #3c4435',paddingTop:25,fontSize:21.75,color:INK.orange,opacity:k(f,15,29)}}>测试场景</div>
 <Line top={505} opacity={k(f,22,35)}>├─  免运费：低于 / 等于 / 高于门槛</Line>
 <Line top={554} opacity={k(f,28,41)}>├─  优惠码：SAVE10 折扣金额</Line>
 <Line top={603} opacity={k(f,34,47)}>└─  配送：送货 / 门店自提</Line>
 <AskInput top={674} busy/>
 <Trace top={355} lines={['  const subtotal = quantity * 20;','  const shipping = pickup || subtotal > 100 ? 0 : 5;','  const discount = coupon === "SAVE10" ? subtotal * 0.05 : 0;']}/>
 </TerminalWindow>;

export const TimelinePanel:React.FC<{f?:number;frame?:boolean;details?:number;fixed?:boolean}>=({f=80,frame=true,details=0,fixed=false})=>{
 const contents=<>
  <AskBanner top={65} small/>
  <Line top={169} size={22} color={INK.muted}>/run task.json · JEV 评分完成 · 全部执行</Line>
  {timelineBlocks.map((b,i)=>{const failed=!fixed&&(i===2||i===4);return <div key={b.s} data-test-row={i} style={{position:'absolute',left:b.x,top:b.y,width:1270,height:50,display:'flex',gap:35,alignItems:'center',fontSize:21.75,opacity:k(f,2+i*4,8+i*4),translate:`0 ${i>2?details*165:0}px`,background:i===2&&details>0?'#2c211b':'transparent',paddingLeft:i===2&&details>0?13:0}}><span style={{color:failed?INK.red:INK.green,width:96}}>{failed?'FAIL':'PASS'}</span><span style={{width:430,lineHeight:1.25}}>{b.s}<span style={{display:"block",fontSize:14,color:"#707d6c"}}>{caseFiles[i]}.browser.json</span></span><span style={{color:INK.muted,fontSize:16.5}}>{failed?i===2?'shipping  5.00 → 应为 0.00':'discount  2.00 → 应为 4.00':'assertions passed'}</span></div>})}
  {details>0&&<div style={{position:'absolute',left:80,top:395,width:1220,height:details*162,overflow:'hidden',background:'#241d18',borderLeft:'2px solid #b8855a',padding:'14px 24px',opacity:details,fontSize:19.5,lineHeight:1.75}}><div style={{color:INK.orange}}>满 100 元，仍收了 5 元运费。</div><div><span style={{color:INK.muted}}>app.js:11</span> &nbsp; subtotal &gt; 100</div><div style={{color:'#a9b59e'}}>交回 coding agent 修复</div></div>}
  <Line top={613+details*165} size={24} color={fixed?INK.green:INK.orange} opacity={k(f,27,38)}>{fixed?'✓ 本轮复测通过':'发现两处问题，准备交回修复。'}</Line>
  <Trace top={648+details*165} size={14} lines={['report.md  ·  result.json  ·  coding-handoff.json  ·  tests/acc-01 … acc-06']}/>
  <AskInput top={673+details*165}/>
 </>;
 return frame?<TerminalWindow title="askJEV — askjev-cli — checkout" height={TERM.h+details*190} footer="">{contents}</TerminalWindow>:contents;
};

export const HandoffTerminal:React.FC<{f?:number;compact?:boolean}>=({f=50,compact=false})=><TerminalWindow title="askJEV — askjev-cli — checkout" width={compact?1320:1480} height={compact?610:780} footer="">
 <AskBanner top={65} small/>
 <Line top={163} color="#5fd7af" size={compact?29:36}>已完成 · 发现缺陷</Line>
 <Line top={compact?234:266} size={compact?25:30} opacity={k(f,0,10)}>01  满 100 元仍收运费</Line>
 <Line top={compact?280:322} color={INK.muted} size={compact?22:25} opacity={k(f,3,13)}>    app.js:11  ·  预期 0.00，实际 5.00</Line>
 <Trace top={compact?314:369} f={f} at={4} size={14} lines={['    const shipping = pickup || subtotal > 100 ? 0 : 5;']}/>
 <Line top={compact?345:422} size={compact?25:30} opacity={k(f,7,17)}>02  SAVE10 只减了 5%</Line>
 <Line top={compact?391:478} color={INK.muted} size={compact?22:25} opacity={k(f,10,20)}>    app.js:12  ·  预期 4.00，实际 2.00</Line>
 <Trace top={compact?425:522} f={f} at={11} size={14} lines={['    const discount = coupon === "SAVE10" ? subtotal * 0.05 : 0;']}/>
 <Line top={compact?458:560} color={INK.cyan} size={23}>交回 coding agent 修复。</Line>
 <AskInput top={compact?501:647}/>
 </TerminalWindow>;
export const TaskCard:React.FC<{f?:number;complete?:boolean}>=({f=40})=><HandoffTerminal compact f={f}/>;
export const Workspace:React.FC<{f?:number;fixed?:boolean}>=({f=70,fixed=false})=>fixed?<RegressionTerminal f={f}/>:<HandoffTerminal f={f}/>;

export const DiffTerminal:React.FC<{f?:number;part?:number}>=({f=100,part=0})=>{
 const second=part===1;const at=second?52:0;
 return <TerminalWindow title="coding agent — app.js" height={790}>
  <Line top={83} color={INK.green} size={27}>❯ git diff -- app.js</Line>
  <Line top={156} size={35}>{second?'SAVE10，按 10% 计算。':'满 100 元，就该免运费。'}</Line>
  <Line top={219} color={INK.muted} size={22}>app.js &nbsp; / &nbsp; {second?'优惠码':'免运费门槛'}</Line>
  <div style={{position:'absolute',top:294,left:45,right:45,fontSize:21.0,lineHeight:1.65,overflow:'hidden'}}>
   <div style={{color:'#8b9486',padding:'14px 24px'}}> const subtotal = quantity * 20;</div>
   <div style={{background:'#4e242633',color:'#de938d',padding:'17px 24px',borderLeft:'3px solid #a65c58',opacity:k(f,at+3,at+13)}}>{second?'- const discount = coupon === \'SAVE10\' ? subtotal * 0.05 : 0;':'- const shipping = pickup || subtotal > 100 ? 0 : 5;'}</div>
   <div style={{background:'#34562935',color:'#b0dc91',padding:'17px 24px',borderLeft:'3px solid #77a65b',opacity:k(f,at+16,at+27)}}>{second?'+ const discount = coupon === \'SAVE10\' ? subtotal * 0.10 : 0;':'+ const shipping = pickup || subtotal >= 100 ? 0 : 5;'}</div>
   <div style={{margin:'36px 24px',fontSize:18.0,color:'#acbca2',opacity:k(f,at+27,at+36)}}>✓ {second?'折扣 2.00 → 4.00':'运费 5.00 → 0.00'}</div>
  </div>
  <Line top={656} size={23} color={INK.cyan} opacity={k(f,at+33,at+43)}>交给 askJEV，再测一遍。</Line>
 </TerminalWindow>;
};
export const MiniCode:React.FC<{f?:number}>=({f=100})=><DiffTerminal f={f} part={f>51?1:0}/>;

export const RegressionTerminal:React.FC<{f?:number}>=({f=80})=><TerminalWindow title="coding agent — askJEV 复测" height={780}>
 <Line top={84} size={26} color={INK.green}>❯ askjev regress --from "$RUN" --project ./checkout</Line>
 <div style={{position:'absolute',left:55,top:182,width:1370,height:399,borderLeft:'2px solid #8d7958',padding:'21px 29px',background:'#191e16'}}>
  <div style={{display:'flex',gap:16,alignItems:'center',fontSize:21.75,color:INK.orange}}><Mark size={34}/>askJEV <span style={{fontSize:16.5,color:INK.muted}}> / 原测试复测</span></div>
  {['满 100 元免运费','SAVE10 折扣','普通配送','三件商品','超过免运费门槛','门店自提'].map((s,i)=><div key={s} style={{fontSize:21.75,lineHeight:'42px',opacity:k(f,2+i*7,8+i*7)}}><span style={{display:'inline-block',width:150,color:INK.green}}>✓ PASS</span>{s}{i<2&&<span style={{color:INK.muted,marginLeft:65,fontSize:18.0}}>{i===0?'shipping 0.00':'discount 4.00'}</span>}</div>)}
 </div>
 <Trace top={566} f={f} at={44} lines={["regress  →  tests/acc-01 … acc-06.browser.json","result   →  passed_cases: 6, failed_cases: 0"]}/>
 <Line top={628} size={35} color={INK.green} opacity={k(f,44,54)}>修复完成。</Line>
 <Line top={685} size={22} color={INK.muted} opacity={k(f,49,58)}>askJEV 已返回结果，coding agent 继续工作。</Line>
 </TerminalWindow>;
export const Completed:React.FC<{f?:number}>=({f=70})=><RegressionTerminal f={f}/>;
export const NarrowIssue:React.FC<{f:number}>=({f})=><TerminalWindow title="askJEV — 复测返回" width={1100} height={370}>
 <Line top={91} size={35} color={f>32?INK.green:INK.text}>{f>32?'✓ 修复完成':'满 100 元免运费'}</Line>
 <Line top={155} size={25} color={INK.muted}>shipping  5.00 <span style={{color:INK.green}}>→ 0.00</span></Line>
 <div data-ui-target="issue" style={{position:'absolute',right:35,top:251,fontSize:18.0,color:INK.cyan,width:225,height:44,lineHeight:'44px',textAlign:'center',scale:buttonPose(f,26).scale,translate:`0 ${buttonPose(f,26).y}px`}}>{f>32?'✓ 已复测':'▸ 查看修复'}</div>
 </TerminalWindow>;
export const SessionRipple:React.FC<{f:number}>=({f})=><AbsoluteFill style={{opacity:.45}}><div style={{position:'absolute',inset:0,clipPath:`ellipse(${1500+Math.sin(f/32)*150}px 420px at ${1170-f*8}px 1050px)`}}><Spectrum f={f+62}/></div></AbsoluteFill>;

export const IntegrationTerminal:React.FC<{f?:number}>=({f=80})=><TerminalWindow title="coding agent — skills / askjev-agent">
 <Line top={82} color={INK.green} size={28}>❯ 测试交给 askJEV。</Line>
 <div style={{position:'absolute',top:179,left:67,fontSize:23.25,lineHeight:1.97}}>{[['coding agent','写代码，修问题。'],['  └─ askJEV','生成测试、执行、复测。'],['       └─ JEV','为测试场景评分。']].map(([a,b],i)=><div key={a} style={{opacity:k(f,i*8,i*8+11)}}><span style={{display:'inline-block',width:465,whiteSpace:'pre',color:i===0?INK.text:i===1?INK.orange:INK.cyan}}>{a}</span><span style={{fontSize:21.0,color:'#a2b09a'}}>{b}</span></div>)}</div>
 <div style={{position:'absolute',left:67,right:67,top:456,borderTop:'1px solid #3f4936',paddingTop:31,fontSize:19.5,lineHeight:1.8,opacity:k(f,24,40)}}><div style={{color:INK.muted}}>模型与执行分工</div><div><span style={{color:INK.cyan}}>JEV GPU 评分</span> <span style={{color:'#5e6859',margin:'0 25px'}}> / </span><span style={{color:INK.orange}}>可选自托管生成</span></div><div style={{fontSize:16.5,color:'#879480'}}>DGX Spark · CUDA 推理  /  本机 Node 与 Chrome 执行</div></div>
 </TerminalWindow>;
export const IssueList=HandoffTerminal;
