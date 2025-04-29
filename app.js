import dotenv from "dotenv";
dotenv.config();
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import session from "express-session";
import passport from "passport";
import passportLocalMongoose from "passport-local-mongoose";
import findOrCreate from "mongoose-findorcreate";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || uuidv4(), // Use a UUID as the session secret for better security
    resave: false,
    saveUninitialized: false,
  })
);
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection setup based on environment
const mongoURI =
  process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI_REMOTE // Remote MongoDB (e.g., MongoDB Atlas)
    : process.env.MONGODB_URI_LOCAL; // Local MongoDB (for local development)

mongoose.set("strictQuery", false);
mongoose
  .connect(mongoURI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error: ", err));

// User Schema and Model
const userSchema = new mongoose.Schema({
  name: String,
  password: String,
  role: String, // "donor" or "ngo"
  createdAt: { type: Date, default: Date.now },
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
const User = mongoose.model("User", userSchema);

// Passport Setup
passport.use(User.createStrategy());
passport.serializeUser(function (user, done) {
  done(null, user.id);
});
passport.deserializeUser(async function (id, done) {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Routes
app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/donor-dashboard", (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.role !== "donor") {
      return res.redirect("/" + req.user.role + "-dashboard");
    }
    res.render("donor-dashboard.ejs", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

app.get("/ngo-dashboard", (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.role !== "ngo") {
      return res.redirect("/" + req.user.role + "-dashboard");
    }
    res.render("ngo-dashboard.ejs", { user: req.user });
  } else {
    res.redirect("/login");
  }
});

// Register Route (Handles user registration)
app.post("/register", (req, res) => {
  const { name, username, password, role } = req.body;

  User.register({ username, name, role }, password, (err, user) => {
    if (err) {
      console.log(err);
      return res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/" + role + "-dashboard");
      });
    }
  });
});

// Local Login Route
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard-role-redirect",
    failureRedirect: "/login",
  })
);

// Role-based Redirect after Login
app.get("/dashboard-role-redirect", (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.role === "donor") {
      return res.redirect("/donor-dashboard");
    } else if (req.user.role === "ngo") {
      return res.redirect("/ngo-dashboard");
    }
  } else {
    res.redirect("/login");
  }
});

// Logout Route
app.get("/logout", (req, res) => {
  req.logout(function (err) {
    res.redirect("/");
  });
});

// Server Initialization
app.listen(port, () => {
  console.log(`App started listening on port ${port}`);
});
