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
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: false,
  })
);
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection
const mongoURI =
  process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI_REMOTE // Remote MongoDB (for production)
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

// Food Donation Schema and Model
const foodDonationSchema = new mongoose.Schema({
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  foodType: String,
  quantity: String,
  expiry: Number,
  pickupAddress: String,
  contactNumber: String,
  status: {
    type: String,
    default: "Pending",
  },
  peopleFed: Number,
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const FoodDonation = mongoose.model("FoodDonation", foodDonationSchema);

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

// Donate Food Form
app.get("/donate", (req, res) => {
  if (req.isAuthenticated() && req.user.role === "donor") {
    res.render("donate.ejs", { user: req.user });
  } else {
    res.redirect("/login");
  }
});
// Handle Food Donation Submission
app.post("/donate", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");

  const { foodType, quantity, pickupAddress, contactNumber } = req.body;

  try {
    const donation = new FoodDonation({
      donor: req.user._id,
      foodType,
      quantity,
      pickupAddress,
      contactNumber,
    });

    await donation.save();
    res.redirect("/donor-dashboard");
  } catch (error) {
    console.error("Donation error:", error);
    res.redirect("/donate");
  }
});

app.get("/donor-dashboard", async (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.role !== "donor") {
      return res.redirect("/" + req.user.role + "-dashboard");
    }
    const donations = await FoodDonation.find({ donor: req.user._id });
    res.render("donor-dashboard.ejs", { user: req.user, donations });
  } else {
    res.redirect("/login");
  }
});

// NGO Dashboard Route
app.get("/ngo-dashboard", async (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== "ngo") {
    return res.redirect("/login");
  }

  const { status, pickupAddress } = req.query;

  // Pagination setup
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;

  // Filter setup
  const query = {};
  if (status && status !== "All") query.status = status;
  if (pickupAddress) query.pickupAddress = new RegExp(pickupAddress, "i");

  // Count total donations for pagination
  const total = await FoodDonation.countDocuments(query);

  // Get paginated, filtered donations
  const donations = await FoodDonation.find(query)
    .skip(skip)
    .limit(limit)
    .populate("donor");

  res.render("ngo-dashboard.ejs", {
    user: req.user,
    donations,
    filters: {
      status: status || "All",
      pickupAddress: pickupAddress || "",
    },
    currentPage: page,
    totalPages: Math.ceil(total / limit),
  });
});

// toggle-status Route (for changing donation status)
// This route is used to toggle the status of a donation between "Accepted" and "Pending"
app.post("/toggle-status/:id", async (req, res) => {
  try {
    const donation = await FoodDonation.findById(req.params.id);
    if (!donation) {
      return res.status(404).send("Donation not found");
    }

    // Toggle status
    donation.status = donation.status === "Pending" ? "Accepted" : "Pending";
    await donation.save();

    res.redirect("/ngo-dashboard"); // or redirect to req.get("referer") to go back to previous page
  } catch (err) {
    console.error("Error toggling status:", err);
    res.status(500).send("Server Error");
  }
});

// Handle Food Donation Acceptance
app.post("/accept-donation/:id", async (req, res) => {
  if (!req.isAuthenticated() || req.user.role !== "ngo")
    return res.redirect("/login");

  const donationId = req.params.id;

  try {
    await FoodDonation.findByIdAndUpdate(donationId, {
      status: "Accepted",
      acceptedBy: req.user._id,
      peopleFed: Math.floor(Math.random() * 10) + 1, // optional random value
    });
    res.redirect("/ngo-dashboard");
  } catch (err) {
    console.log(err);
    res.redirect("/ngo-dashboard");
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
