const STORAGE_KEY = "mijn-boodschappen-v1";

const defaultData = {
  "Brood & bakkerij": [
    "Brood","Bolletjes","Krentenbollen","Beschuit","Crackers"
  ],
  "Beleg": [
    "Kaas","Ham","Worst","Pindakaas","Hagelslag","Jam"
  ],
  "Zuivel": [
    "Melk","Karnemelk","Yoghurt","Boter","Eieren"
  ],
  "Frisdrank": [
    "Cola","Sinas","7-Up","Water","Spa rood","Sap"
  ],
  "Groente & fruit": [
    "Aardappelen","Uien","Tomaten","Komkommer","Appels","Bananen"
  ],
  "Vlees & vleeswaren": [
    "Gehakt","Kip","Hamburgers","Spek","Vleeswaren"
  ],
  "Snacks": [
    "Chips","Koek","Snoep","Noten"
  ],
  "Diepvries": [
    "Friet","Pizza","Groente diepvries","IJs"
  ],
  "Huishouden": [
    "Toiletpapier","Keukenrol","Afwasmiddel","Vuilniszakken","Wasmiddel"
  ],
  "Overig": []
};

function freshState(){
  const items = [];
  for (const [category,names] of Object.entries(defaultData)){
    for (const name of names){
      items.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        name, category, needed:false, qty:1
      });
    }
  }
  return {items};
}

let state = loadState();
let filter = "all";

function loadState(){
  try{
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed && Array.isArray(parsed.items)) return parsed;
  }catch(e){}
  const init = freshState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
  return init;
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const listEl = document.getElementById("shoppingList");
const addForm = document.getElementById("addForm");
const productName = document.getElementById("productName");
const categorySelect = document.getElementById("categorySelect");
const showAllBtn = document.getElementById("showAllBtn");
const showNeededBtn = document.getElementById("showNeededBtn");
const uncheckAllBtn = document.getElementById("uncheckAllBtn");
const summary = document.getElementById("summary");

Object.keys(defaultData).forEach(cat=>{
  const opt=document.createElement("option");
  opt.value=cat; opt.textContent=cat;
  categorySelect.appendChild(opt);
});

function render(){
  listEl.innerHTML="";
  const categories = Object.keys(defaultData);
  let shownAny=false;

  for(const category of categories){
    let items = state.items.filter(i=>i.category===category);
    if(filter==="needed") items = items.filter(i=>i.needed);
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

    const source = filter==="needed"
      ? items
      : state.items.filter(i=>i.category===category);

    if(source.length===0){
      const empty=document.createElement("div");
      empty.className="empty";
      empty.textContent="Nog geen producten in deze categorie.";
      itemsBox.appendChild(empty);
    } else {
      source.sort((a,b)=>a.name.localeCompare(b.name,"nl")).forEach(item=>{
        const row=document.createElement("div");
        row.className="item-row";

        const label=document.createElement("label");
        label.className="item-main";

        const cb=document.createElement("input");
        cb.type="checkbox";
        cb.checked=item.needed;
        cb.addEventListener("change",()=>{
          item.needed=cb.checked;
          saveState(); render();
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
        qty.textContent=`${item.qty || 1}x`;
        qty.addEventListener("click",()=>{
          item.qty = (item.qty || 1) >= 9 ? 1 : (item.qty || 1)+1;
          saveState(); render();
        });

        const del=document.createElement("button");
        del.type="button";
        del.className="delete-btn danger";
        del.textContent="×";
        del.addEventListener("click",()=>{
          if(confirm(`"${item.name}" verwijderen?`)){
            state.items=state.items.filter(i=>i.id!==item.id);
            saveState(); render();
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

addForm.addEventListener("submit",e=>{
  e.preventDefault();
  const name=productName.value.trim();
  if(!name) return;
  state.items.push({
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name,
    category:categorySelect.value,
    needed:true,
    qty:1
  });
  saveState();
  productName.value="";
  render();
  productName.focus();
});

showAllBtn.addEventListener("click",()=>{filter="all";render()});
showNeededBtn.addEventListener("click",()=>{filter="needed";render()});
uncheckAllBtn.addEventListener("click",()=>{
  if(confirm("Alle aangevinkte boodschappen uitvinken?")){
    state.items.forEach(i=>i.needed=false);
    saveState(); render();
  }
});

let deferredPrompt=null;
const installBtn=document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt=e;
  installBtn.hidden=false;
});
installBtn.addEventListener("click",async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  installBtn.hidden=true;
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

render();
