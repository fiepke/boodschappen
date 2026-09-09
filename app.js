const STORAGE_KEY = "mijn-boodschappen-v3";
const SUPABASE_URL = "https://aliitsfybgjstzxiwwce.supabase.co";
const SUPABASE_KEY = "sb_publishable_06tYrlNpi-7JqpO_rFc4wQ_VeBsTPlJ";
const TABLE = "shopping_items";
const REST_URL = `${SUPABASE_URL}/rest/v1/${TABLE}`;

const defaultData = {
  "Brood & bakkerij": ["Brood","Bolletjes","Krentenbollen","Beschuit","Crackers"],
  "Beleg": ["Kaas","Ham","Worst","Pindakaas","Hagelslag","Jam"],
  "Zuivel": ["Melk","Karnemelk","Yoghurt","Boter","Eieren"],
  "Frisdrank": ["Cola","Sinas","7-Up","Water","Spa rood","Sap"],
  "Groente & fruit": ["Aardappelen","Uien","Tomaten","Komkommer","Appels","Bananen"],
  "Vlees & vleeswaren": ["Gehakt","Kip","Hamburgers","Spek","Vleeswaren"],
  "Snacks": ["Chips","Koek","Snoep","Noten"],
  "Diepvries": ["Friet","Pizza","Groente diepvries","IJs"],
  "Huishouden": ["Toiletpapier","Keukenrol","Afwasmiddel","Vuilniszakken","Wasmiddel"],
  "Overig": []
};

function freshState(){
  const items=[];
  for(const [category,names] of Object.entries(defaultData)){
    for(const name of names){
      items.push({
        id:"local-"+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)),
        name, category, needed:false, qty:1
      });
    }
  }
  return {items};
}

function loadLocalState(){
  try{
    for(const key of [STORAGE_KEY,"mijn-boodschappen-v2","mijn-boodschappen-v1"]){
      const v=JSON.parse(localStorage.getItem(key));
      if(v && Array.isArray(v.items)) return v;
    }
  }catch(e){}
  return freshState();
}

let state=loadLocalState();
let filter="all";
let syncing=false;
let pollTimer=null;

function saveLocalState(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}

function headers(extra={}){
  return {
    "apikey":SUPABASE_KEY,
    "Content-Type":"application/json",
    ...extra
  };
}

async function rest(path="",options={}){
  const response=await fetch(REST_URL+path,{
    ...options,
    headers:headers(options.headers||{})
  });
  const text=await response.text();
  let data=null;
  if(text){
    try{data=JSON.parse(text)}catch{data=text}
  }
  if(!response.ok){
    throw new Error(typeof data==="object" && data?.message ? data.message : `HTTP ${response.status}`);
  }
  return data;
}

function dbToItem(row){
  return {
    id:row.id,
    name:row.product,
    category:row.category||"Overig",
    needed:!!row.checked,
    qty:Number(row.quantity)||1
  };
}

function itemToDb(item){
  return {
    product:item.name,
    category:item.category,
    quantity:Number(item.qty)||1,
    checked:!!item.needed
  };
}

async function fetchRemoteItems(){
  return await rest("?select=id,product,category,quantity,checked,created_at&order=id.asc");
}

async function seedRemoteIfEmpty(){
  const rows=await fetchRemoteItems();
  if(rows.length) return rows;

  const payload=state.items.map(itemToDb);
  return await rest("",{
    method:"POST",
    headers:{"Prefer":"return=representation"},
    body:JSON.stringify(payload)
  }) || [];
}

async function refreshFromRemote(){
  if(syncing || !navigator.onLine) return;
  syncing=true;
  try{
    const rows=await fetchRemoteItems();
    if(rows.length){
      state.items=rows.map(dbToItem);
      saveLocalState();
      render();
    }
  }catch(e){
    console.warn("Synchronisatie mislukt:",e);
  }finally{
    syncing=false;
  }
}

async function initSync(){
  try{
    const rows=await seedRemoteIfEmpty();
    if(rows.length){
      state.items=rows.map(dbToItem);
      saveLocalState();
      render();
    }
    pollTimer=setInterval(refreshFromRemote,3000);
  }catch(e){
    console.warn("Supabase niet beschikbaar; lokale lijst blijft werken.",e);
  }
}

async function updateRemoteItem(item){
  if(String(item.id).startsWith("local-")) return;
  await rest(`?id=eq.${encodeURIComponent(item.id)}`,{
    method:"PATCH",
    headers:{"Prefer":"return=minimal"},
    body:JSON.stringify(itemToDb(item))
  });
}

async function insertRemoteItem(item){
  const rows=await rest("",{
    method:"POST",
    headers:{"Prefer":"return=representation"},
    body:JSON.stringify(itemToDb(item))
  });
  return rows?.[0]||null;
}

async function deleteRemoteItem(item){
  if(String(item.id).startsWith("local-")) return;
  await rest(`?id=eq.${encodeURIComponent(item.id)}`,{
    method:"DELETE",
    headers:{"Prefer":"return=minimal"}
  });
}

const listEl=document.getElementById("shoppingList");
const addForm=document.getElementById("addForm");
const productName=document.getElementById("productName");
const categorySelect=document.getElementById("categorySelect");
const showAllBtn=document.getElementById("showAllBtn");
const showNeededBtn=document.getElementById("showNeededBtn");
const uncheckAllBtn=document.getElementById("uncheckAllBtn");
const summary=document.getElementById("summary");

Object.keys(defaultData).forEach(cat=>{
  const opt=document.createElement("option");
  opt.value=cat;
  opt.textContent=cat;
  categorySelect.appendChild(opt);
});

function render(){
  listEl.innerHTML="";
  const categories=Object.keys(defaultData);
  const extra=[...new Set(state.items.map(i=>i.category).filter(c=>!categories.includes(c)))];
  const allCategories=categories.concat(extra);
  let shownAny=false;

  for(const category of allCategories){
    let items=state.items.filter(i=>i.category===category);
    if(filter==="needed") items=items.filter(i=>i.needed);
    if(items.length===0 && filter==="needed") continue;

    shownAny=true;
    const section=document.createElement("section");
    section.className="category card";

    const head=document.createElement("div");
    head.className="category-head";
    const h2=document.createElement("h2");
    h2.textContent=category;
    const count=document.createElement("span");
    count.className="count";
    const neededCount=state.items.filter(i=>i.category===category && i.needed).length;
    count.textContent=`${neededCount} nodig`;
    head.append(h2,count);

    const itemsBox=document.createElement("div");
    itemsBox.className="items";
    const source=filter==="needed"?items:state.items.filter(i=>i.category===category);

    if(source.length===0){
      const empty=document.createElement("div");
      empty.className="empty";
      empty.textContent="Nog geen producten in deze categorie.";
      itemsBox.appendChild(empty);
    }else{
      source.slice().sort((a,b)=>a.name.localeCompare(b.name,"nl")).forEach(item=>{
        const row=document.createElement("div");
        row.className="item-row";

        const label=document.createElement("label");
        label.className="item-main";

        const cb=document.createElement("input");
        cb.type="checkbox";
        cb.checked=item.needed;
        cb.addEventListener("change",async()=>{
          const old=item.needed;
          item.needed=cb.checked;
          saveLocalState();render();
          try{await updateRemoteItem(item)}catch(e){
            item.needed=old;saveLocalState();render();
            alert("Wijziging kon niet online worden opgeslagen.");
          }
        });

        const check=document.createElement("span");
        check.className="checkmark";
        const name=document.createElement("span");
        name.className="item-name";
        name.textContent=item.name;
        label.append(cb,check,name);

        const actions=document.createElement("div");
        actions.className="item-actions";

        const qty=document.createElement("button");
        qty.type="button";
        qty.className="qty-btn secondary";
        qty.textContent=`${item.qty||1}x`;
        qty.addEventListener("click",async()=>{
          const old=item.qty||1;
          item.qty=old>=9?1:old+1;
          saveLocalState();render();
          try{await updateRemoteItem(item)}catch(e){
            item.qty=old;saveLocalState();render();
            alert("Aantal kon niet online worden opgeslagen.");
          }
        });

        const del=document.createElement("button");
        del.type="button";
        del.className="delete-btn danger";
        del.textContent="×";
        del.addEventListener("click",async()=>{
          if(!confirm(`"${item.name}" verwijderen?`)) return;
          const backup=[...state.items];
          state.items=state.items.filter(i=>i.id!==item.id);
          saveLocalState();render();
          try{await deleteRemoteItem(item)}catch(e){
            state.items=backup;saveLocalState();render();
            alert("Product kon niet online worden verwijderd.");
          }
        });

        actions.append(qty,del);
        row.append(label,actions);
        itemsBox.appendChild(row);
      });
    }

    section.append(head,itemsBox);
    listEl.appendChild(section);
  }

  if(!shownAny){
    const empty=document.createElement("div");
    empty.className="card empty";
    empty.textContent="Er zijn nog geen boodschappen aangevinkt.";
    listEl.appendChild(empty);
  }

  const needed=state.items.filter(i=>i.needed);
  const totalQty=needed.reduce((s,i)=>s+(i.qty||1),0);
  summary.textContent=`${needed.length} verschillende producten aangevinkt • ${totalQty} stuks totaal`;
  showAllBtn.classList.toggle("active",filter==="all");
  showNeededBtn.classList.toggle("active",filter==="needed");
}

addForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const name=productName.value.trim();
  if(!name) return;

  const temp={
    id:"local-"+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)),
    name,
    category:categorySelect.value,
    needed:true,
    qty:1
  };

  state.items.push(temp);
  saveLocalState();
  productName.value="";
  render();
  productName.focus();

  try{
    const row=await insertRemoteItem(temp);
    if(row){
      const i=state.items.findIndex(x=>x.id===temp.id);
      if(i>=0) state.items[i]=dbToItem(row);
      saveLocalState();
      render();
    }
  }catch(e){
    console.warn(e);
    alert("Product staat lokaal, maar online opslaan lukte niet.");
  }
});

showAllBtn.addEventListener("click",()=>{filter="all";render()});
showNeededBtn.addEventListener("click",()=>{filter="needed";render()});

uncheckAllBtn.addEventListener("click",async()=>{
  if(!confirm("Alle aangevinkte boodschappen uitvinken?")) return;
  const backup=state.items.map(i=>({...i}));
  state.items.forEach(i=>i.needed=false);
  saveLocalState();render();

  try{
    await rest("?checked=eq.true",{
      method:"PATCH",
      headers:{"Prefer":"return=minimal"},
      body:JSON.stringify({checked:false})
    });
  }catch(e){
    state.items=backup;saveLocalState();render();
    alert("Alles uitvinken kon niet online worden opgeslagen.");
  }
});

let deferredPrompt=null;
const installBtn=document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;installBtn.hidden=false;
});
installBtn.addEventListener("click",async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;installBtn.hidden=true;
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}

window.addEventListener("online",refreshFromRemote);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshFromRemote()});

render();
initSync();
