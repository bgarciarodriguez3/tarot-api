const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "tarot-backend-railway",
    status: "up"
  });
});

app.get("/api/session", (req, res) => {
  res.json({
    ok: true,
    message: "session endpoint ok"
  });
});

app.post("/api/shopify/order-paid", (req, res) => {
  console.log("Webhook recibido");
  console.log(req.body);

  return res.json({
    ok: true,
    message: "webhook recibido correctamente"
  });
});

app.post("/api/reading/result", (req, res) => {
  return res.json({
    ok: true,
    message: "reading result ok"
  });
});

app.post("/api/reading/email", (req, res) => {
  return res.json({
    ok: true,
    message: "reading email ok"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});
