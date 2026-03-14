require("dotenv").config()

const express = require("express")
const cors = require("cors")
const crypto = require("crypto")
const { Resend } = require("resend")

const app = express()

const resend = new Resend(process.env.RESEND_API_KEY)

const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use("/api/shopify/order-paid", express.raw({ type: "application/json" }))

/* CONFIGURACION PRODUCTOS */

const PRODUCTS = {
  "10496012616017": {
    name: "Mensaje de los Ángeles",
    deck: "angeles",
    spread: 4,
    deckSize: 12
  },

  "10495993446737": {
    name: "Camino de la Semilla Estelar",
    deck: "semilla_estelar",
    spread: 5,
    deckSize: 22
  },

  "10493383082321": {
    name: "Lectura Profunda",
    deck: "arcanos_mayores",
    spread: 12,
    deckSize: 22
  },

  "10493369745745": {
    name: "Tres Puertas del Destino",
    deck: "arcanos_mayores",
    spread: 3,
    deckSize: 22
  }
}

/* ALMACENAMIENTO */

const readings = new Map()

/* UTILIDADES */

function generateKey(orderId, lineItemId, productId) {
  return `${orderId}-${lineItemId}-${productId}`
}

function randomCards(deckSize, spread) {

  const cards = []

  const numbers = Array.from({length: deckSize}, (_,i)=>i+1)

  while(cards.length < spread){

    const index = Math.floor(Math.random()*numbers.length)

    cards.push(numbers.splice(index,1)[0])

  }

  return cards
}

function verifyShopify(req){

  const hmac = req.get("X-Shopify-Hmac-Sha256")

  const digest = crypto
  .createHmac("sha256",process.env.SHOPIFY_WEBHOOK_SECRET)
  .update(req.body)
  .digest("base64")

  return hmac === digest

}

/* SESSION */

app.post("/api/session",(req,res)=>{

  const {productId} = req.body

  const config = PRODUCTS[productId]

  if(!config){

    return res.status(400).json({
      ok:false,
      error:"producto no configurado"
    })

  }

  res.json({
    ok:true,
    spread:config.spread,
    deck:config.deck,
    deckSize:config.deckSize
  })

})

/* RESULTADO LECTURA */

app.post("/api/reading/result",(req,res)=>{

  const {orderId,lineItemId,productId,email} = req.body

  const config = PRODUCTS[productId]

  if(!config){

    return res.status(400).json({
      ok:false,
      error:"producto inválido"
    })

  }

  const key = generateKey(orderId,lineItemId,productId)

  if(readings.has(key)){

    return res.json({
      ok:true,
      repeated:true,
      reading:readings.get(key)
    })

  }

  const cards = randomCards(config.deckSize,config.spread)

  const reading = {

    key,
    email,
    productId,
    product:config.name,
    deck:config.deck,
    cards,
    created:Date.now()

  }

  readings.set(key,reading)

  res.json({
    ok:true,
    reading
  })

})

/* EMAIL */

app.post("/api/reading/email", async(req,res)=>{

  const {key} = req.body

  const reading = readings.get(key)

  if(!reading){

    return res.status(404).json({
      ok:false
    })

  }

  if(reading.sent){

    return res.json({
      ok:true,
      already:true
    })

  }

  await resend.emails.send({

    from:process.env.RESEND_FROM_EMAIL,

    to:reading.email,

    subject:"Tu lectura de tarot",

    html:`

<h2>Tu lectura está lista</h2>

<p>${reading.product}</p>

<p>Cartas: ${reading.cards.join(", ")}</p>

`

  })

  reading.sent=true

  res.json({ok:true})

})

/* WEBHOOK SHOPIFY */

app.post("/api/shopify/order-paid", async(req,res)=>{

  if(!verifyShopify(req)){

    return res.status(401).send("invalid")

  }

  const order = JSON.parse(req.body.toString())

  const email = order.email

  for(const item of order.line_items){

    const productId = String(item.product_id)

    const config = PRODUCTS[productId]

    if(!config) continue

    const key = generateKey(order.id,item.id,productId)

    if(readings.has(key)) continue

    const cards = randomCards(config.deckSize,config.spread)

    const reading = {

      key,
      email,
      productId,
      product:config.name,
      deck:config.deck,
      cards

    }

    readings.set(key,reading)

    await resend.emails.send({

      from:process.env.RESEND_FROM_EMAIL,

      to:email,

      subject:"Tu lectura de tarot",

      html:`<h2>${config.name}</h2><p>Cartas: ${cards.join(", ")}</p>`

    })

  }

  res.json({ok:true})

})

app.listen(PORT,()=>{

  console.log("server running")

})
