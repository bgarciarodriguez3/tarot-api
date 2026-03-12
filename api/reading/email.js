{% comment %}
Tapete Arcanos Mayores (3/12) — versión automatizada
Flujo:
1. Cliente entra con token
2. Voltea 3 o 12 cartas
3. La lectura se genera automáticamente
4. Puede enviársela por email
{% endcomment %}

<section id="ta-arc-{{ section.id }}" class="ta-arc">
  <div class="page-width">

    <div class="ta-arc__access" id="arc_access_{{ section.id }}">
      <div class="ta-arc__accessbox" id="arc_accessbox_{{ section.id }}">
        <strong>🔮 Verificando tu acceso…</strong>
      </div>
    </div>

    {% if section.settings.heading != blank %}
      <h1 class="ta-arc__title">{{ section.settings.heading | escape }}</h1>
    {% endif %}

    {% if section.settings.texto != blank %}
      <div class="ta-arc__intro rte">{{ section.settings.texto }}</div>
    {% endif %}

    <div class="ta-arc__controls">
      <div class="ta-arc__counter" id="arc_counter_{{ section.id }}">Seleccionadas: 0/3</div>
    </div>

    <div class="ta-arc__grid" id="arc_grid_{{ section.id }}"></div>

    <div class="ta-arc__actions">
      <button type="button" class="ta-arc__btn ta-arc__btn--ghost" id="arc_reset_{{ section.id }}">
        Reiniciar
      </button>
    </div>

    <div class="ta-arc__results" id="arc_results_{{ section.id }}" style="display:none;">
      <div class="ta-arc__box">

        <h3 class="ta-arc__resulttitle">✨ Tu lectura</h3>

        <h4>Mensaje general</h4>

        <div id="arc_short_{{ section.id }}"></div>

        <div id="arc_long_{{ section.id }}"></div>

        <hr>

        <h4>Tus cartas</h4>

        <div id="arc_cardsread_{{ section.id }}"></div>

      </div>

      <div class="ta-arc__email">

        <input
          id="arc_email_{{ section.id }}"
          class="ta-arc__input"
          type="email"
          placeholder="Email para enviarte la lectura"
        />

        <button
          type="button"
          class="ta-arc__btn"
          id="arc_send_{{ section.id }}"
          disabled>

          📩 Enviarme esta lectura

        </button>

        <div class="ta-arc__hint" id="arc_hint_{{ section.id }}"></div>

      </div>

    </div>

  </div>
</section>

<script>
(function(){

function getParam(name){
return new URLSearchParams(window.location.search).get(name);
}

const token = getParam("token");
const order = getParam("order");

const apiAccess = "{{ section.settings.access_api_base }}";
const apiReading = "{{ section.settings.api_base }}";

const grid = document.getElementById("arc_grid_{{ section.id }}");
const counter = document.getElementById("arc_counter_{{ section.id }}");

const resultsWrap = document.getElementById("arc_results_{{ section.id }}");
const shortEl = document.getElementById("arc_short_{{ section.id }}");
const longEl = document.getElementById("arc_long_{{ section.id }}");

const cardsRead = document.getElementById("arc_cardsread_{{ section.id }}");

const btnSend = document.getElementById("arc_send_{{ section.id }}");
const emailInput = document.getElementById("arc_email_{{ section.id }}");

const hint = document.getElementById("arc_hint_{{ section.id }}");

let selected = [];

let MAX = 3;

function detectSpread(){
const qs = new URLSearchParams(window.location.search);

const spread = parseInt(qs.get("spread"),10);

if(spread === 12) return 12;

return 3;
}

MAX = detectSpread();

counter.innerText = "Seleccionadas: 0/" + MAX;

async function validateAccess(){

if(!token) return false;

const res = await fetch(apiAccess + "/api/session?token=" + token);

if(!res.ok) return false;

return true;

}

async function fetchReading(){

const payload = {
token: token,
order: order,
spread: MAX,
cards: selected
};

const res = await fetch(apiReading + "/api/reading/result",{
method:"POST",
headers:{ "Content-Type":"application/json"},
body: JSON.stringify(payload)
});

return await res.json();

}

async function sendEmail(){

const to = emailInput.value.trim();

if(!to.includes("@")){
hint.innerText="Escribe un email válido";
return;
}

btnSend.disabled=true;
btnSend.innerText="Enviando…";

const payload = {
to: to,
order: order,
spread: MAX,
cards: selected,
text: buildEmailText()
};

await fetch(apiReading + "/api/reading/email",{
method:"POST",
headers:{ "Content-Type":"application/json"},
body: JSON.stringify(payload)
});

hint.innerText="✅ Lectura enviada";

btnSend.innerText="Enviar por email";

}

function buildEmailText(){

let txt="✨ Tu lectura\n\n";

selected.forEach((c,i)=>{

txt += (i+1)+". "+c.name+"\n";

if(c.description){
txt += c.description+"\n\n";
}

});

return txt;

}

function renderReading(data){

resultsWrap.style.display="block";

shortEl.innerText=data.short || "";

longEl.innerText=data.long || "";

cardsRead.innerHTML="";

selected.forEach((c,i)=>{

const div=document.createElement("div");

div.innerHTML="<strong>"+(i+1)+". "+c.name+"</strong>";

cardsRead.appendChild(div);

});

btnSend.disabled=false;

}

function autoReading(){

fetchReading().then(data=>{
renderReading(data);
});

}

function selectCard(card){

if(selected.length >= MAX) return;

selected.push(card);

counter.innerText="Seleccionadas: "+selected.length+"/"+MAX;

if(selected.length === MAX){

setTimeout(autoReading,400);

}

}

async function init(){

const access = await validateAccess();

if(!access){

grid.innerHTML="<p>🔒 Acceso restringido</p>";

return;

}

const cards = `{{ section.settings.cards_list }}`.split("\n");

cards.forEach(line=>{

const p=line.split("|");

const id=p[0];
const name=p[1];
const url=p[2];

const div=document.createElement("div");

div.className="ta-arc__card";

div.innerHTML='<img src="'+url+'" style="width:100%">';

div.onclick=function(){

selectCard({
id:id,
name:name
});

};

grid.appendChild(div);

});

}

btnSend.onclick=sendEmail;

init();

})();
</script>

{% schema %}
{
"name": "Arcanos 3/12",
"settings": [

{ "type":"text","id":"heading","label":"Título","default":"Arcanos Mayores" },

{ "type":"richtext","id":"texto","label":"Texto","default":"<p>Elige tus cartas.</p>" },

{ "type":"textarea","id":"cards_list","label":"Cartas (id|nombre|url)" },

{ "type":"text","id":"api_base","label":"API lectura","default":"https://tarot-api-vercel.vercel.app" },

{ "type":"text","id":"access_api_base","label":"API acceso","default":"https://tarot-api-production-4364.up.railway.app" }

]
}
{% endschema %}
