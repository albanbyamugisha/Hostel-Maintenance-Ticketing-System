import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
const workspaceDir = '/home/alban-byamugisha/Desktop/Hostel Maintenance Ticketing System';
const buildDir = path.join(workspaceDir,'.presentation-build');
const specs = JSON.parse(await fs.readFile(path.join(buildDir,'content-measured.json'),'utf8'));
const P = Presentation.create({slideSize:{width:1280,height:720}});
const C={bg:'#F7F5EF',ink:'#142B25',green:'#0B5D4B',muted:'#52635D',line:'#C9D4CB',white:'#FFFFFF',light:'#EAF1EB'};
const font='Lato';
function text(slide,value,x,y,w,h,size=26,bold=false,color=C.ink,align='left'){
 const s=slide.shapes.add({geometry:'textbox',name:value.slice(0,55),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 s.text=value;s.text.style={typeface:font,fontSize:size,bold,color,alignment:align,verticalAlignment:'top',autoFit:'none',insets:0};return s;
}
const tables=[];
for(let i=0;i<specs.length;i++){
 const spec=specs[i],slide=P.slides.add();slide.background.fill=spec.kind==='cover'?C.ink:C.bg;
 slide.speakerNotes.text=`${spec.notes}\n\nSources and evidence\n${spec.sources.map(v=>'- '+v).join('\n')}\n\nImplementation reviewed 1 November 2026. Initial passwords intentionally omitted.`;
 if(spec.kind==='cover'){
  text(slide,spec.title,80,145,675,210,58,true,'#F7F5EF');
  text(slide,spec.subtitle,80,415,650,90,31,false,'#B5D6C4');
  text(slide,spec.course,80,590,630,36,24,false,'#B5D6C4');
  const img=await fs.readFile('/tmp/hostelcare-final-login.png');
  slide.images.add({blob:img.buffer.slice(img.byteOffset,img.byteOffset+img.byteLength),contentType:'image/png',alt:'Actual HostelCare login screen with no visible credentials',position:{left:790,top:104,width:410,height:510},fit:'contain'});
 } else {
  text(slide,spec.title,80,58,1120,100,44,true,C.green);
  text(slide,'SWE2102  Requirements Engineering',80,684,850,20,15,false,C.muted);
  text(slide,String(i+1).padStart(2,'0'),1140,681,60,26,18,false,C.muted,'right');
  if(spec.kind==='table'){
   const values=[spec.headers,...spec.rows],heights=spec.heights;
   const table=slide.tables.add({rows:values.length,columns:spec.headers.length,left:80,top:180,width:1120,height:heights.reduce((a,b)=>a+b,0),columnWidths:spec.widths,values});
   table.styleOptions={headerRow:false,bandedRows:false};
   table.borders.assign({fill:C.line,width:0.8,style:'solid'});
   for(let r=0;r<values.length;r++){
    table.rows[r].height=heights[r];
    for(let c=0;c<spec.headers.length;c++){
     const cell=table.getCell(r,c);cell.fill=r===0?C.green:r%2?C.white:C.light;
     cell.text.style={typeface:font,fontSize:23,bold:r===0||c===0,color:r===0?C.white:C.ink,verticalAlignment:'middle',autoFit:'none'};
     table.cells.block({row:r,column:c,rowCount:1,columnCount:1}).assign({margins:{left:12,right:12,top:8,bottom:8}});
    }
   }
   tables.push(i+1);
  } else if(spec.kind==='columns'){
   for(const [x,heading,items] of [[80,spec.leftTitle,spec.left],[675,spec.rightTitle,spec.right]]){
    text(slide,heading,x,182,525,45,30,true,C.green);
    items.forEach((value,n)=>text(slide,value,x,245+n*128,525,115,26,false));
   }
  } else if(spec.kind==='agenda'){
   for(const [x,items] of [[80,spec.left],[675,spec.right]])items.forEach(([label,value],n)=>{
    text(slide,label,x,182+n*87,100,40,29,true,C.green);
    text(slide,value,x+112,184+n*87,413,70,25,false);
   });
  } else if(spec.kind==='statement'){
   text(slide,spec.quote,80,180,1120,140,33,true,C.ink);
   spec.items.forEach(([label,value],n)=>{text(slide,label,80,355+n*70,130,50,26,true,C.green);text(slide,value,230,355+n*70,970,62,26);});
  } else if(spec.kind==='sources'){
   spec.items.forEach(([label,value],n)=>{text(slide,label,80,186+n*112,285,80,27,true,C.green);text(slide,value,390,186+n*112,810,96,25);});
  }
 }
}
await fs.mkdir(path.join(buildDir,'renders'),{recursive:true});
await (await PresentationFile.exportPptx(P)).save(path.join(buildDir,'candidate-v2.pptx'));
console.log('Exported draft with '+specs.length+' slides');
await fs.writeFile(path.join(buildDir,'table-slides.json'),JSON.stringify(tables));
for(let i=0;i<P.slides.items.length;i++){
 const slide=P.slides.getItem(i);
 const blob=await P.export({slide,format:'png',scale:1});
 await fs.writeFile(path.join(buildDir,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
 if(i%5===0)console.log('Rendered '+(i+1));
}
console.log('Rendered all slides');
