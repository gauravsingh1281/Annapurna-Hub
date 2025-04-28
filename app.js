import express from "express";
const app = express();
const port = 3000;

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
app.get("/ngo-dashboard", (req, res) => {
  res.render("ngo-dashboard.ejs");
});

app.get("/donor-dashboard", (req, res) => {
  res.render("donor-dashboard.ejs");
});

app.get("/donate", (req, res) => {
  res.render("donate.ejs");
});

app.listen(port, () => {
  console.log(`App started listening on port ${port}`);
});
