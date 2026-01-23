const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const port = process.env.PORT || 3000;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

var admin = require("firebase-admin");

var serviceAccount = require(`${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

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
  const usersCollection = db.collection('users');
  const reviewCollection = db.collection('user-review');
  const foodCollection = db.collection('food');
  const chefCollection = db.collection('chef');
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

    app.patch('/users/:id', async (req, res) => {
      const requestInfo = req.body;
      console.log(requestInfo)
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          requestInfo: requestInfo.requestRole,
          requestStatus: 'Pending',
          requestCreatedAt: new Date(),
        }
      }
      console.log(updateDoc)
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    })

    app.get('/users/:email/role', verifyAuthToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || 'User' });
    })

    app.post('/review', async (req, res) => {
      const review = req.body;
      const {foodId, email} = req.body;
      const alreadyReviewed = await reviewCollection.findOne({foodId, email});
      if(alreadyReviewed) {
        return res.status(400).send({message: 'You have already reviewed this food'});
      };
      review.createdAt = new Date();
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    })

    app.patch('/review/:id', verifyAuthToken, async(req, res) => {
      const id = req.params.id;
      const {review, rating} = req.body;
      const query = {_id: new ObjectId(id)};
      const existingReview = await reviewCollection.findOne(query)
      if(existingReview.email !== req.decoded_Email){
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const updateDoc = {
        $set: {
          review,
          rating,
          createdAt: new Date(),
        }
      }
      const result = await reviewCollection.updateOne(query, updateDoc);
      res.send(result)
    })

    app.get('/review/:email', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const query = { email };
      const review = await reviewCollection.find(query).toArray();
      res.send(review)
    })

    app.delete('/review/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/review/user/:id', async (req, res) => {
      const foodId = req.params.id;
      const query = { foodId: foodId };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/food', async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    })

    app.get('/food/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollection.findOne(query);
      res.send(result)
    })


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