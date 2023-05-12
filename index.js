const express = require("express");
const cors = require("cors");
require("dotenv").config();
var jwt = require("jsonwebtoken");
const compression = require("compression");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 5000;

// Middle Ware
app.use(compression());
app.use(cors());
app.use(express.json());

// Root end point
app.get("/", async (req, res) => {
  res.send("Server is connect");
});
// Veryfy with JWT token
const verifyJwt = (req, res, next) => {
  const authorizationToken = req.headers.authorization;

  if (!authorizationToken) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authorizationToken.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vrkwl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const run = async () => {
  try {
     client.connect();
    //Tools Collection
    const toolsCollection = client.db("nortexTools").collection("tools");
    // Bookings Collection
    const bookingsCollection = client.db("nortexTools").collection("bookings");
    // payments Collection
    const paymentsCollection = client.db("nortexTools").collection("payments");
    // Users collection
    const usersCollection = client.db("nortexTools").collection("users");
    // Review Collection
    const reviewCollection = client.db("nortexTools").collection("reviews");
    const profileCollection = client.db("nortexTools").collection("profiles");
    // varify Admin
    const verifyAdmin = async (req, res, next) => {
      const adminRequester = req.decoded.email;
      const adminRequesterEmail = await usersCollection.findOne({
        email: adminRequester,
      });
      if (adminRequesterEmail.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden access" });
      }
    };
    // Admin can make a admin
    app.get("/admin/:email", async (req, res) => {
      const adminEmail = req.params.email;
      const admin = await usersCollection.findOne({ email: adminEmail });
      const isAdmin = admin.role === "admin";
      res.send({ admin: isAdmin });
    });

    app.post("/create-payment-intent", async (req, res) => {
      const service = req.body;
      const inTotal = service.total;
      const amount = inTotal * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.patch("/booking/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const insertPaymentDetails = await paymentsCollection.insertOne(payment);
      const updatedBooking = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedDoc);
    });

    // Make an admin
    app.put("/user/admin/:email", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // jwt token
    app.put("/singIn/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(filter, updateDoc, option);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });
    // Update Profile
    app.put("/updateProfile/:email", verifyJwt, async (req, res) => {
      const email = req.params.email;
      const person = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updateDoc = {
        $set: person,
      };
      const result = await profileCollection.updateOne(
        filter,
        updateDoc,
        option
      );
      res.send(result);
    });

    // Get all tools
    app.get("/tools", async (req, res) => {
      const tools = await toolsCollection.find({}).toArray();
      res.send(tools);
    });
    // get review
    app.get("/happyReviews", async (req, res) => {
      const reviews = await reviewCollection.find({}).toArray();
      res.send(reviews);
    });
    // get all users
    app.get("/allUsers", verifyJwt, verifyAdmin, async (req, res) => {
      const allUsers = await usersCollection.find({}).toArray();
      res.send(allUsers);
    });
    // Get single tools by id
    app.get("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tool = await toolsCollection.findOne(query);
      res.send(tool);
    });
    // Book products
    app.post("/bookings", verifyJwt, async (req, res) => {
      const bookingItem = req.body;
      const booked = await bookingsCollection.insertOne(bookingItem);
      res.send(booked);
    });

    app.post("/addReview", verifyJwt, async (req, res) => {
      const userReview = req.body;
      const review = await reviewCollection.insertOne(userReview);
      res.send(review);
    });
    // Add Product
    app.post("/addProduct", verifyJwt, verifyAdmin, async (req, res) => {
      const addProduct = req.body;
      const add = await toolsCollection.insertOne(addProduct);
      res.send(add);
    });
    // Delete Product
    app.delete("/deleteTools/:id", verifyJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const deleteProduct = await toolsCollection.deleteOne(query);
      res.send(deleteProduct);
    });
    // Get my booking products
    app.get("/myItems", verifyJwt, async (req, res) => {
      const email = req.query.userEmail;
      const decodedEmail = req.decoded.email;
      if (decodedEmail === email) {
        const query = { email: email };

        const myItems = await bookingsCollection.find(query).toArray();
        res.send(myItems);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });
    // Get my one item by Id
    app.get("/getMyItems/:id", verifyJwt, async (req, res) => {
      const paymentId = req.params.id;
      const query = { _id: ObjectId(paymentId) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });
    // Delete Order

    app.delete("/cancelOrder/:id", verifyJwt, async (req, res) => {
      const deleteId = req.params.id;
      const query = { _id: ObjectId(deleteId) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
};
run().catch(console.dir);
// Port
app.listen(port, () => {
  console.log("Server is running on port", port);
});
