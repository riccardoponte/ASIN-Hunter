// ===== Parser XLSX / CSV in-browser, senza librerie esterne =====
// Espone window.SheetParse.fromArrayBuffer(buf, name) -> {columns, rows}
(function(){
  function b64ToBytes(s){const bin=atob(s);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
  async function inflateRaw(bytes){
    const ds=new DecompressionStream('deflate-raw');
    const st=new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function unzip(bytes){
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const files={};let i=0;
    while(i+4<=bytes.length){
      const sig=dv.getUint32(i,true); if(sig!==0x04034b50) break;
      const method=dv.getUint16(i+8,true);
      const compSize=dv.getUint32(i+18,true);
      const nameLen=dv.getUint16(i+26,true);
      const extraLen=dv.getUint16(i+28,true);
      const nameStart=i+30;
      const name=new TextDecoder().decode(bytes.slice(nameStart,nameStart+nameLen));
      const dataStart=nameStart+nameLen+extraLen;
      const comp=bytes.slice(dataStart,dataStart+compSize);
      files[name]= method===0 ? comp : await inflateRaw(comp);
      i=dataStart+compSize;
    }
    return files;
  }
  const xml=(s)=>new DOMParser().parseFromString(s,'application/xml');
  const colToIdx=(col)=>{let n=0;for(const ch of col)n=n*26+(ch.charCodeAt(0)-64);return n-1;};

  async function parseXlsx(bytes){
    const files=await unzip(bytes);const dec=new TextDecoder();
    let shared=[];
    if(files['xl/sharedStrings.xml']){
      const doc=xml(dec.decode(files['xl/sharedStrings.xml']));
      shared=[...doc.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
    }
    const sheetName=Object.keys(files).find(n=>/^xl\/worksheets\/sheet1\.xml$/.test(n))||Object.keys(files).find(n=>/^xl\/worksheets\/.*\.xml$/.test(n));
    if(!sheetName) throw new Error('foglio non trovato');
    const doc=xml(dec.decode(files[sheetName]));
    const rows=[];
    [...doc.getElementsByTagName('row')].forEach(row=>{
      const cells=[];
      [...row.getElementsByTagName('c')].forEach(c=>{
        const ref=c.getAttribute('r')||'';const col=ref.replace(/[0-9]/g,'');
        const t=c.getAttribute('t');const v=c.getElementsByTagName('v')[0];
        let val='';
        if(t==='s'&&v)val=shared[parseInt(v.textContent,10)]||'';
        else if(t==='inlineStr'){const is=c.getElementsByTagName('t')[0];val=is?is.textContent:'';}
        else if(v)val=v.textContent;
        cells.push({col,val});
      });
      rows.push(cells);
    });
    let maxCol=0; rows.forEach(r=>r.forEach(c=>{maxCol=Math.max(maxCol,colToIdx(c.col)+1);}));
    return rows.map(r=>{const arr=new Array(maxCol).fill('');r.forEach(c=>{const idx=colToIdx(c.col);if(idx>=0)arr[idx]=c.val;});return arr;});
  }

  function parseCsv(text){
    // rileva separatore: ; se compare piu' di ,
    const firstLine=(text.split(/\r?\n/)[0]||'');
    const sep=(firstLine.split(';').length>firstLine.split(',').length)?';':',';
    const rows=[]; let row=[]; let cur=''; let q=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(q){
        if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; }
        else cur+=ch;
      }else{
        if(ch==='"') q=true;
        else if(ch===sep){ row.push(cur);cur=''; }
        else if(ch==='\n'){ row.push(cur);rows.push(row);row=[];cur=''; }
        else if(ch==='\r'){}
        else cur+=ch;
      }
    }
    if(cur.length||row.length){ row.push(cur);rows.push(row); }
    return rows.filter(r=>r.some(c=>c!==''));
  }

  function toColumns(matrix){
    if(!matrix.length) return {columns:[],rows:[]};
    const width=Math.max(...matrix.map(r=>r.length));
    const header=[];
    for(let c=0;c<width;c++){
      const h=(matrix[0][c]||'').toString().trim();
      header.push(h||('Colonna '+String.fromCharCode(65+c)));
    }
    return {columns:header, rows:matrix.slice(1)};
  }

  async function fromArrayBuffer(buf,name){
    const bytes=new Uint8Array(buf);
    const isZip=bytes[0]===0x50&&bytes[1]===0x4b;
    if(isZip||/\.xlsx$/i.test(name||'')){
      const matrix=await parseXlsx(bytes);
      return toColumns(matrix);
    }else{
      const text=new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/,'');
      return toColumns(parseCsv(text));
    }
  }

  window.SheetParse={ fromArrayBuffer, _b64ToBytes:b64ToBytes };
})();
