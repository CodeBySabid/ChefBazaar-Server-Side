const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const port = process.env.PORT || 3000;

const { MongoClient, ServerApiVersion } = require('mongodb');

var admin = require("firebase-admin");

var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// Middleware

app.use(express.json());
app.use(cors());

const verifyAuthToken = async (req, res, next) => {
  const token = req.headers?.authorization;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_Email = decoded.email;
    // if(req.decoded_Email = req.params.email) {
    //   return res.status(403).send({ message: 'Forbidden access' })
    // }
    next();
  }
  catch (err) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  if (res.headersSent) return;
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lqmwh22.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  const db = client.db('localchef_bazaar');
  const usersCollection = db.collection('users')
  try {
    await client.connect();

    app.post('/users', async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email })
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
      user.createdAt = new Date();
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/:email', verifyAuthToken, async (req, res) => {
      if (req.decoded_Email !== req.params.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user);
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Server is running")
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})