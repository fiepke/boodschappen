const STORAGE_KEY = "mijn-boodschappen-v2";
const SUPABASE_URL = "https://aliitsfybqjstzxiwvce.supabase.co";
const SUPABASE_KEY = "sb_publishable_06tYrlNpi-7JqpO_rFc4wQ_VeBsTPlJ";
const TABLE = "shopping_items";

const defaultData = {
  "Aardappelen, groente en fruit": [
    "Aardappelen","Uien","Knoflook","Tomaten","Komkommer","Paprika",
    "Sla","Wortels","Bloemkool","Broccoli","Champignons","Prei",
    "Courgette","Appels","Bananen","Sinaasappels","Mandarijnen",
    "Druiven","Aardbeien","Peren","Citroen"
  ],

  "Verse maaltijden en gemak": [
    "Maaltijdsalade","Verse soep","Pizza vers","Pasta maaltijd",
    "Kant-en-klaar maaltijd","Pannenkoeken","Wraps"
  ],

  "Vlees, vis en vega": [
    "Gehakt","Kipfilet","Kip","Hamburgers","Spek","Slavinken",
    "Schnitzel","Worst","Biefstuk","Varkensvlees","Zalm",
    "Vissticks","Tonijn","Vegetarische burgers"
  ],

  "Zuivel, boter en eieren": [
    "Melk","Karnemelk","Yoghurt","Vla","Kwark","Boter",
    "Margarine","Eieren","Slagroom","Kookroom","Crème fraîche"
  ],

  "Vleeswaren, kaas en tapas": [
    "Ham","Kipfilet beleg","Salami","Boterhamworst","Filet americain",
    "Jonge kaas","Belegen kaas","Oude kaas","Smeerkaas","Brie",
    "Mozzarella","Olijven"
  ],

  "Brood & bakkerij": [
    "Brood","Bolletjes","Krentenbollen","Beschuit","Crackers",
    "Croissants","Stokbrood","Pistolets","Tijgerbrood"
  ],

  "Ontbijt en beleg": [
    "Pindakaas","Hagelslag","Jam","Chocopasta","Honing",
    "Ontbijtkoek","Muesli","Cornflakes"
  ],

  "Frisdrank en sappen": [
    "Cola","Cola Zero","Sinas","7-Up","Sprite","Cassis",
    "IJsthee","Appelsap","Sinaasappelsap","Multivitaminesap",
    "Spa rood","Spa blauw"
  ],

  "Koffie en thee": [
    "Koffie","Koffiebonen","Koffiepads","Cappuccino",
    "Thee","Suiker","Koffiemelk"
  ],

  "Snacks, koek en snoep": [
    "Chips","Nootjes","Koek","Chocolade","Snoep",
    "Drop","Liga","Mueslirepen"
  ],

  "Diepvries": [
    "Friet","Pizza","Kroketten","Frikandellen","Bitterballen",
    "IJs","Diepvriesgroente","Diepvriesfruit"
  ],

  "Sauzen, kruiden en koken": [
    "Mayonaise","Ketchup","Curry","Mosterd","Knoflooksaus",
    "Pastasaus","Tomatenpuree","Olijfolie","Bakboter",
    "Zout","Peper","Kruiden","Bouillon"
  ],

  "Huishouden": [
    "Toiletpapier","Keukenrol","Afwasmiddel","Vaatwastabletten",
    "Wasmiddel","Wasverzachter","Vuilniszakken","Schoonmaakmiddel",
    "Sponsjes","Aluminiumfolie","Bakpapier"
  ],

  "Persoonlijke verzorging": [
    "Shampoo","Douchegel","Tandpasta","Tandenborstel",
    "Deodorant","Zeep","Scheerschuim"
  ]

  
};

function freshState() {
  const items = [];
  for (const [category,names] of Object.entries(defaultData)) {
    for (const name of names) {
      items.push({
        id: "local-" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
        name, category, needed:false, qty:1
      });
    }
  }
  return {items};
}

function loadLocalState() {
  try {
    const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v2 && Array.isArray(v2.items)) return v2;

    // Neem de bestaande v1-lijst automatisch mee bij de eerste update.
    const old = JSON.parse(localStorage.getItem("mijn-boodschappen-v1"));
    if (old && Array.isArray(old.items)) return old;
  } catch(e) {}
  return freshState();
}

let state = loadLocalState();
let filter = "all";
let searchQuery = "";
const collapsedCategories = new Set([
  ...Object.keys(defaultData),
  ...state.items.map(i => i.category)
]);

let sb = null;
let channel = null;
let syncing = false;
let currentUser = null;
let offers = [];
function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dbToItem(row) {
  return {
    id: row.id,
    name: row.product,
    category: row.category || "Overig",
    needed: !!row.checked,
    qty: Number(row.quantity) || 1
  };
}

function itemToDb(item) {
  return {
    product: item.name,
    category: item.category,
    user_id: currentUser ? currentUser.id : null,
    quantity: Number(item.qty) || 1,
    checked: !!item.needed
  };
}

async function loadSupabaseLibrary() {
  if (window.supabase) return;
  await new Promise((resolve,reject)=>{
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = resolve;
    s.onerror = ()=>reject(new Error("Supabase bibliotheek kon niet worden geladen."));
    document.head.appendChild(s);
  });
}

async function fetchRemoteItems() {
  if (!currentUser) return [];

  const {data,error} = await sb
    .from(TABLE)
    .select("id,product,category,quantity,checked,created_at,user_id")
    .eq("user_id", currentUser.id)
    .order("id", {ascending:true});

  if (error) throw error;
  return data || [];
}
async function fetchOffers() {
  if (!sb || !currentUser) return [];

  const { data, error } = await sb
    .from("offers")
    .select("id,product,store,regular_price,offer_price,valid_from,valid_until,active")
    .eq("active", true);

  if (error) throw error;

  const today = new Date();
  today.setHours(0,0,0,0);

  return (data || []).filter(offer => {
    const fromOk =
      !offer.valid_from ||
      new Date(offer.valid_from + "T00:00:00") <= today;

    const untilOk =
      !offer.valid_until ||
      new Date(offer.valid_until + "T23:59:59") >= today;

    return fromOk && untilOk;
  });
}

function getBestOfferForProduct(productName) {
  const key = String(productName || "")
    .trim()
    .toLowerCase();

  const matches = offers.filter(offer =>
    String(offer.product || "")
      .trim()
      .toLowerCase() === key
  );

  if (!matches.length) return null;

  return matches
    .slice()
    .sort((a,b) =>
      Number(a.offer_price) - Number(b.offer_price)
    )[0];
}

function formatOfferDate(value) {
  if (!value) return "";

  const d = new Date(value + "T00:00:00");

  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long"
  });
}


async function syncDefaultProducts() {
  if (!sb || !currentUser) return;

  const existingRows = await fetchRemoteItems();

  const existingKeys = new Set(
    existingRows.map(row =>
      `${String(row.category).trim().toLowerCase()}|${String(row.product).trim().toLowerCase()}`
    )
  );

  const missingRows = [];

  for (const [category, names] of Object.entries(defaultData)) {
    for (const name of names) {
      const key =
        `${category.trim().toLowerCase()}|${name.trim().toLowerCase()}`;

      if (!existingKeys.has(key)) {
        missingRows.push({
          product: name,
          category: category,
          quantity: 1,
          checked: false,
          user_id: currentUser.id
        });
      }
    }
  }

  if (!missingRows.length) return;

  const { error } = await sb
    .from(TABLE)
    .insert(missingRows);

  if (error) throw error;
}
async function seedRemoteIfEmpty() {
  if (!currentUser) return [];

  const rows = await fetchRemoteItems();
  if (rows.length) return rows;

  const localRows = freshState().items.map(itemToDb);
  if (!localRows.length) return [];

  const {data,error} = await sb
    .from(TABLE)
    .insert(localRows)
    .select("id,product,category,quantity,checked,created_at,user_id");

  if (error) throw error;
  return data || [];
}

async function refreshFromRemote() {
  if (!sb || syncing) return;
  syncing = true;
  try {
    const rows = await fetchRemoteItems();
    state.items = rows.map(dbToItem);
    saveLocalState();
    render();
  } catch (e) {
    console.warn("Online synchronisatie mislukt; lokale lijst blijft beschikbaar.", e);
  } finally {
    syncing = false;
  }
}

async function initSync() {
  try {
    await loadSupabaseLibrary();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: userData } = await sb.auth.getUser();
currentUser = userData?.user || null;
    if (!currentUser) {
  showLoginScreen();
  return;
}
    await syncDefaultProducts();
    offers = await fetchOffers();
    const rows = await seedRemoteIfEmpty();
    state.items = rows.map(dbToItem);
    saveLocalState();
    render();

    channel = sb
      .channel("boodschappen-live")
      .on("postgres_changes", {
        event:"*",
        schema:"public",
        table:TABLE
      }, () => refreshFromRemote())
      .subscribe();
  } catch (e) {
    console.warn("Supabase niet beschikbaar; de app werkt lokaal verder.", e);
  }
}

async function updateRemoteItem(item) {
  if (!sb || !currentUser || String(item.id).startsWith("local-")) return;

  const {error} = await sb
    .from(TABLE)
    .update(itemToDb(item))
    .eq("id", item.id)
    .eq("user_id", currentUser.id);

  if (error) throw error;
}

async function deleteRemoteItem(item) {
  if (!sb || !currentUser || String(item.id).startsWith("local-")) return;

  const {error} = await sb
    .from(TABLE)
    .delete()
    .eq("id", item.id)
    .eq("user_id", currentUser.id);

  if (error) throw error;
}
async function insertRemoteItem(item) {
  if (!sb || !currentUser) return null;

  const {data,error} = await sb
    .from(TABLE)
    .insert(itemToDb(item))
    .select()
    .single();

  if (error) throw error;
  return data;
}


const listEl = document.getElementById("shoppingList");
const addForm = document.getElementById("addForm");
const productName = document.getElementById("productName");
const categorySelect = document.getElementById("categorySelect");
const showAllBtn = document.getElementById("showAllBtn");
const showNeededBtn = document.getElementById("showNeededBtn");
const uncheckAllBtn = document.getElementById("uncheckAllBtn");
const summary = document.getElementById("summary");
// Inlogscherm
function showLoginScreen() {
  const loginBox = document.createElement("div");
  loginBox.id = "loginBox";
  loginBox.style.maxWidth = "500px";
  loginBox.style.margin = "30px auto";
  loginBox.style.padding = "24px";
  loginBox.style.background = "white";
  loginBox.style.borderRadius = "18px";
  loginBox.style.boxShadow = "0 8px 25px rgba(0,0,0,.10)";

  loginBox.innerHTML = `
    <h2 style="margin-top:0">Mijn Boodschappen</h2>
    <p>Log in om je eigen boodschappenlijst te openen.</p>

    <input id="loginEmail"
      type="email"
      placeholder="E-mailadres"
      style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;border:1px solid #b7c8be;border-radius:10px;font-size:16px">

    <input id="loginPassword"
      type="password"
      placeholder="Wachtwoord"
      style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:14px;border:1px solid #b7c8be;border-radius:10px;font-size:16px">

    <button id="loginBtn"
      style="width:100%;padding:12px;background:#198754;color:white;border:0;border-radius:10px;font-weight:bold;font-size:16px">
      Inloggen
    </button>

    <button id="signupBtn"
      style="width:100%;padding:12px;margin-top:10px;background:#eef4f0;border:0;border-radius:10px;font-weight:bold;font-size:16px">
      Nieuw account maken
    </button>

    <div id="loginMessage"
      style="margin-top:12px;text-align:center"></div>
  `;

  document.body.innerHTML = "";
  document.body.appendChild(loginBox);

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMessage");

    msg.textContent = "Bezig met inloggen...";

    const { error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      msg.textContent = "Inloggen mislukt: " + error.message;
      return;
    }

    location.reload();
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMessage");

    if (!email || password.length < 6) {
      msg.textContent = "Vul een geldig e-mailadres en minimaal 6 tekens als wachtwoord in.";
      return;
    }

    msg.textContent = "Account wordt aangemaakt...";

    const { error } = await sb.auth.signUp({
      email,
      password
    });

    if (error) {
      msg.textContent = "Account maken mislukt: " + error.message;
      return;
    }

    msg.textContent = "Account aangemaakt. Controleer eventueel je e-mail en log daarna in.";
  });
}
// Zoekfunctie
const searchBox = document.createElement("input");
searchBox.type = "search";
searchBox.placeholder = "🔍 Zoek product...";
searchBox.autocomplete = "off";
searchBox.style.width = "100%";
searchBox.style.padding = "12px 14px";
searchBox.style.margin = "0 0 14px 0";
searchBox.style.border = "1px solid #b7c8be";
searchBox.style.borderRadius = "12px";
searchBox.style.fontSize = "16px";
searchBox.style.boxSizing = "border-box";

listEl.parentNode.insertBefore(searchBox, listEl);

searchBox.addEventListener("input", () => {
  searchQuery = searchBox.value.trim();
  render();
});

Object.keys(defaultData).forEach(cat=>{
  const opt=document.createElement("option");
  opt.value=cat;
  opt.textContent=cat;
  categorySelect.appendChild(opt);
});

function render() {
  listEl.innerHTML="";
  const categories = Object.keys(defaultData);
  const extraCategories = [...new Set(state.items.map(i=>i.category).filter(c=>!categories.includes(c)))];
  const allCategories = categories.concat(extraCategories);
  let shownAny=false;

  for(const category of allCategories) {
    let items = state.items.filter(i =>
  i.category === category &&
  i.name.toLowerCase().includes(searchQuery.toLowerCase())
);
  if(filter==="needed") items = items.filter(i=>i.needed);

if(searchQuery && items.length===0) continue;
if(items.length===0 && filter==="needed") continue;

    shownAny=true;
    const section=document.createElement("section");
    section.className="category card";

    const head=document.createElement("div");
    head.className="category-head";
   const h2=document.createElement("h2");
const isCollapsed = collapsedCategories.has(category) && searchQuery === "";
h2.textContent = `${isCollapsed ? "▶" : "▼"} ${category}`;

const count=document.createElement("span");
count.className="count";
const neededCount=state.items.filter(i=>i.category===category && i.needed).length;
count.textContent=`${neededCount} nodig`;

head.style.cursor="pointer";
head.style.userSelect="none";

head.addEventListener("click",()=>{
  if(collapsedCategories.has(category)){
    collapsedCategories.delete(category);
  } else {
    collapsedCategories.add(category);
  }
  render();
});

head.append(h2,count);

const itemsBox=document.createElement("div");
itemsBox.className="items";

if(isCollapsed){
  itemsBox.style.display="none";
}

   const source = items;

    if(source.length===0) {
      const empty=document.createElement("div");
      empty.className="empty";
      empty.textContent="Nog geen producten in deze categorie.";
      itemsBox.appendChild(empty);
    } else {
      source
        .slice()
        .sort((a,b)=>a.name.localeCompare(b.name,"nl"))
        .forEach(item=>{
          const row=document.createElement("div");
          row.className="item-row";

          const label=document.createElement("label");
          label.className="item-main";

          const cb=document.createElement("input");
          cb.type="checkbox";
          cb.checked=item.needed;
          cb.addEventListener("change", async()=>{
            const old=item.needed;
            item.needed=cb.checked;
            saveLocalState();
            render();
            try {
              await updateRemoteItem(item);
            } catch(e) {
              item.needed=old;
              saveLocalState();
              render();
              alert("Wijziging kon niet online worden opgeslagen.");
            }
          });

          const check=document.createElement("span");
          check.className="checkmark";

       const nameWrap=document.createElement("span");
nameWrap.style.display="flex";
nameWrap.style.flexDirection="column";
nameWrap.style.gap="3px";

const name=document.createElement("span");
name.className="item-name";
name.textContent=item.name;
nameWrap.appendChild(name);

const offer=getBestOfferForProduct(item.name);

if(offer){
  const offerEl=document.createElement("span");
  offerEl.style.fontSize="12px";
  offerEl.style.fontWeight="700";
  offerEl.style.color="#b42318";
  offerEl.style.lineHeight="1.3";

  const regular = offer.regular_price != null
    ? `€ ${Number(offer.regular_price).toFixed(2).replace(".",",")} → `
    : "";

  const until = offer.valid_until
    ? ` • t/m ${formatOfferDate(offer.valid_until)}`
    : "";

  offerEl.textContent =
    `🏷️ ${offer.store}: ${regular}€ ${Number(offer.offer_price).toFixed(2).replace(".",",")}${until}`;

  nameWrap.appendChild(offerEl);
}

label.append(cb,check,nameWrap);

          const actions=document.createElement("div");
          actions.className="item-actions";

          const qty=document.createElement("button");
          qty.type="button";
          qty.className="qty-btn secondary";
          qty.textContent=`${item.qty || 1}x`;
          qty.addEventListener("click", async()=>{
            const old=item.qty || 1;
            item.qty = old >= 9 ? 1 : old+1;
            saveLocalState();
            render();
            try {
              await updateRemoteItem(item);
            } catch(e) {
              item.qty=old;
              saveLocalState();
              render();
              alert("Aantal kon niet online worden opgeslagen.");
            }
          });
const resetQty=document.createElement("button");
resetQty.type="button";
resetQty.className="qty-btn secondary";
resetQty.textContent="↺ 1x";

resetQty.addEventListener("click", async()=>{
  const old=item.qty || 1;
  item.qty=1;
  saveLocalState();
  render();

  try {
    await updateRemoteItem(item);
  } catch(e) {
    item.qty=old;
    saveLocalState();
    render();
    alert("Aantal kon niet online worden teruggezet naar 1x.");
  }
});
          const del=document.createElement("button");
          del.type="button";
          del.className="delete-btn danger";
          del.textContent="×";
          del.addEventListener("click", async()=>{
            if(!confirm(`"${item.name}" verwijderen?`)) return;
            const backup=[...state.items];
            state.items=state.items.filter(i=>i.id!==item.id);
            saveLocalState();
            render();
            try {
              await deleteRemoteItem(item);
            } catch(e) {
              state.items=backup;
              saveLocalState();
              render();
              alert("Product kon niet online worden verwijderd.");
            }
          });

          actions.append(qty,resetQty,del);
          row.append(label,actions);
          itemsBox.appendChild(row);
        });
    }

    section.append(head,itemsBox);
    listEl.appendChild(section);
  }

  if(!shownAny) {
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

addForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const name=productName.value.trim();
  if(!name) return;

  const temp={
    id:"local-"+(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
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

  try {
    const row=await insertRemoteItem(temp);
    if(row) {
      const i=state.items.findIndex(x=>x.id===temp.id);
      if(i>=0) state.items[i]=dbToItem(row);
      saveLocalState();
      render();
    }
  } catch(e) {
    console.warn(e);
    alert("Product staat lokaal in de lijst, maar kon nog niet online worden opgeslagen.");
  }
});

showAllBtn.addEventListener("click",()=>{filter="all";render()});
showNeededBtn.addEventListener("click",()=>{filter="needed";render()});

uncheckAllBtn.addEventListener("click", async()=>{
  if(!confirm("Alle aangevinkte boodschappen uitvinken?")) return;

  const backup=state.items.map(i=>({...i}));
  state.items.forEach(i=>i.needed=false);
  saveLocalState();
  render();

  if(!sb) return;
  try {
    const {error}=await sb.from(TABLE).update({checked:false}).eq("checked",true);
    if(error) throw error;
  } catch(e) {
    state.items=backup;
    saveLocalState();
    render();
    alert("Alles uitvinken kon niet online worden opgeslagen.");
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

if("serviceWorker" in navigator) {
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

window.addEventListener("online",()=>refreshFromRemote());

render();
initSync();
