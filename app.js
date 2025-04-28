import express from "express";
const app = express();
const port = 3000;
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.listen(port, () => {
  console.log(`App started listening on port ${port}`);
});
