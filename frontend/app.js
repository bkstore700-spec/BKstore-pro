const API = ""; // نفس الدومين (localhost:4000)

function money(n){ return `${Number(n).toFixed(2)} DH`; }

function getCart(){
  return JSON.parse(localStorage.getItem("bk_cart") || "[]");
}
function setCart(items){
  localStorage.setItem("bk_cart", JSON.stringify(items));
}

async function getWhatsappNumber(){
  const r = await fetch("/api/config");
  const j = await r.json();
  return j.whatsapp || "212XXXXXXXXX";
}
