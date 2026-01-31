const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const port = process.env.PORT || 3000;
const crypto = require('crypto');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

var admin = require("firebase-admin");

var serviceAccount = require(`${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// Middleware

function generateTrackingId() {
  const prefix = 'PRCL';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}


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
    // if(req.decoded_Email = req.params_email) {
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
const stripe = require('stripe')(process.env.STRIPE_SECRET);

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
  const orderCollection = db.collection('order-data');
  const favoritesCollection = db.collection('favorites');
  const paymentCollection = db.collection('payments');

  const generateChefId = () => {
    return Math.floor(1000 + Math.random() * 9000);
  }

  const generateUniqueChefId = async () => {
    let chefId;
    let isUnique = false;
    while (!isUnique) {
      chefId = generateChefId();
      const existingChef = await usersCollection.findOne({ chefId });
      if (!existingChef) {
        isUnique = true
      }
    }
    return chefId;
  }

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

    app.patch('/users/:id', verifyAuthToken, async (req, res) => {
      const requestInfo = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          requestInfo: requestInfo.requestRole,
          requestStatus: 'Pending',
          requestCreatedAt: new Date(),
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    })

    app.get('/request', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const admin = await usersCollection.findOne({ email })

      if (!admin || admin.role !== 'Admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const requests = await usersCollection.find({ requestInfo: { $exists: true } }).toArray();
      res.send(requests);
    })

    app.patch('/request/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const email = req.decoded_Email;
      const admin = await usersCollection.findOne({ email });
      if (!admin || admin.role !== 'Admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }
      let updateDoc = {
        $set: {
          requestStatus: status
        }
      }
      if (status === "Accept") {
        if (user.requestInfo === 'Chef') {
          const chefId = await generateUniqueChefId();
          updateDoc.$set.chefId = chefId;
          updateDoc.$set.role = "Chef";
          updateDoc.$set.requestStatus = "Accept"
        }
        if (user.requestInfo === "Admin") {
          updateDoc.$set.role = "Admin";
          updateDoc.$unset = { chefId: '' };
          updateDoc.$set.requestStatus = "Accept";
        }
      }
      if (status === 'Reject') {
        updateDoc.$set.requestStatus = 'Rejected';
      }
      const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send(result);
    })


    app.patch('/makefraud/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const existingUser = await usersCollection.findOne(query)
      if (existingUser.role === 'Admin') {
        return res.send({ message: 'Do not cross your limit' })
      }
      if (existingUser.status === 'Fraud') {
        return res.send(console.log('not allow'))
      }
      const updateDoc = {
        $set: {
          status: status,
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result)
    })

    app.get('/users/:email/role', verifyAuthToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || 'User' });
    })

    app.post('/review', verifyAuthToken, async (req, res) => {
      const review = req.body;
      const { foodId, email } = req.body;
      const alreadyReviewed = await reviewCollection.findOne({ foodId, email });
      if (alreadyReviewed) {
        return res.status(400).send({ message: 'You have already reviewed this food' });
      };
      review.createdAt = new Date();
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    })

    app.patch('/review/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const { review, rating } = req.body;
      const query = { _id: new ObjectId(id) };
      const existingReview = await reviewCollection.findOne(query)
      if (existingReview.email !== req.decoded_Email) {
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

    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result)
    })

    app.delete('/review/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/review/user/:id', verifyAuthToken, async (req, res) => {
      const foodId = req.params.id;
      const query = { foodId: foodId };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/food', async (req, res) => {
      const sortOrder = req.query.sort;
      const searchText = req.query.search;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const query = {};
      if (searchText) {
        query.foodName = { $regex: searchText, $options: 'i' };
      }
      const sort = sortOrder === 'asc' ? 1 : -1;
      const result = await foodCollection.find(query).sort({ price: sort }).skip(skip).limit(limit).toArray();
      res.send(result);
    });

    app.get('/food/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollection.findOne(query);
      res.send(result)
    })

    app.get('/order', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const query = { userEmail: email };
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/order', verifyAuthToken, async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    })

    app.get('/order/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded_Email;
      const query = {
        chefEmail: email,
        chefId: parseInt(id)
      }
      const result = await orderCollection.find(query).toArray();
      res.send(result);
    });

    app.patch('/order/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const queryId = { _id: new ObjectId(id) };
      const status = req.body.status;
      const email = req.decoded_Email;
      const query = {
        email: email,
        role: 'Chef'
      }
      const existingChef = await usersCollection.findOne(query);
      if (!existingChef) {
        return res.send(console.log('you are not allow'));
      }
      const updateDoc = {
        $set: {
          orderStatus: status,
        }
      }
      const result = await orderCollection.updateOne(queryId, updateDoc);
      res.send(result);
    })

    app.get('/order-pending', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const existingAdmin = await usersCollection.findOne({
        email: email,
        role: "Admin",
      })
      if (!existingAdmin) {
        return res.status(301).send({ message: 'already added to favorites' });
      }
      const result = await orderCollection.find({ paymentStatus: "Pending" }).toArray();
      res.send(result)
    })

    app.get('/order-delivered', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const existingAdmin = await usersCollection.findOne({
        email: email,
        role: "Admin",
      })
      if (!existingAdmin) {
        return res.status(301).send({ message: 'already added to favorites' });
      }
      const result = await orderCollection.find({ orderStatus: "Accept" }).toArray();
      res.send(result)
    })

    app.post('/payment-checkout', async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.price) * 100;

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                product_data: {
                  name: `Please pay for: ${paymentInfo.foodName}`,
                },
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          customer_email: paymentInfo.userEmail,
          metadata: {
            foodId: paymentInfo.foodId,
            foodName: paymentInfo.foodName,
          },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
        });

        res.json({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.status(400).send({ success: false });
      }

      const transactionId = session.payment_intent;

      const existingPayment = await paymentCollection.findOne({ transactionId });

      if (existingPayment) {
        return res.send({
          success: true,
          transactionId,
          trackingId: existingPayment.trackingId,
        });
      }

      const trackingId = generateTrackingId();

      const paymentInfo = {
        amount: session.amount_total / 100,
        currency: session.currency,
        customerEmail: session.customer_email,
        foodId: session.metadata.foodId,
        foodName: session.metadata.foodName,
        transactionId,
        trackingId,
        paymentStatus: session.payment_status,
        paidAt: new Date(),
      };

      const resultPayment = await paymentCollection.insertOne(paymentInfo);

      const orderQuery = { _id: new ObjectId(session.metadata.foodId) };

      await orderCollection.updateOne(orderQuery, {
        $set: {
          paymentStatus: 'Paid',
          trackingId,
        },
      });

      return res.send({
        success: true,
        transactionId,
        trackingId,
      });
    });

    app.get('/payments', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const existingEmail = await paymentCollection.findOne({ customElement: email })
      if (!existingEmail) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const result = await paymentCollection.find({ customElement: email }).toArray();
      res.send(result);
    })
    app.post('/favorite/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const email = req.body.email;
      const existingFavorite = await favoritesCollection.findOne({
        mealId: id,
        userEmail: email
      });
      if (existingFavorite) {
        return res.status(301).send({ message: 'already added to favorites' });
      }
      const foodData = await foodCollection.findOne({ _id: new ObjectId(id) });
      const favoriteData = {
        userEmail: email,
        mealId: id,
        mealName: foodData.foodName,
        chefId: foodData.chefId,
        chefName: foodData.chefName,
        price: foodData.price,
        createdAt: new Date(),
      };
      const result = await favoritesCollection.insertOne(favoriteData);
      res.send(result);
    });

    app.get('/favorite/:email', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const result = await favoritesCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.delete('/favorite/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await favoritesCollection.deleteOne(query);
      res.send(result)
    })

    app.get('/manager/:role', verifyAuthToken, async (req, res) => {
      try {
        const role = req.params.role;
        if (role !== 'Admin') {
          return res.status(403).send({ message: 'Forbidden access' });
        }
        const result = await usersCollection.find().toArray()
        res.send(result)
      }
      catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    })

    app.post('/meals/:email', verifyAuthToken, async (req, res) => {
      try {
        const email = req.decoded_Email;
        const mealData = req.body;
        mealData.createdAt = new Date();
        const id = req.body.chefId;
        const existingChef = await usersCollection.findOne({
          email: email,
          chefId: id,
        })
        if (!existingChef) {
          return res.status(403).send({ message: 'Unauthorized access' });
        }
        const result = await foodCollection.insertOne(mealData);
        res.send(result);
      }
      catch (error) {
        console.log(error)
      }
    })

    app.get('/meals/:role', verifyAuthToken, async (req, res) => {
      const email = req.decoded_Email;
      const existingChef = await usersCollection.findOne({
        email: email,
        role: "Chef",
      })
      if (!existingChef) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      const result = await foodCollection.find({
        userEmail: email
      }).toArray();
      res.send(result)
    })

    app.get('/meal/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded_Email;
      const query = { _id: new ObjectId(id) }
      const existingFood = await foodCollection.find({
        userEmail: email,
        query,
        role: 'Chef',
      })
      if (!existingFood) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      const result = await foodCollection.findOne(query);
      res.send(result)
    })

    app.patch('/meal/:id', verifyAuthToken, async (req, res) => {
      try {
        const id = req.params.id;
        const mealInfo = req.body;
        const email = req.decoded_Email;
        const query = { _id: new ObjectId(id) }
        const existingFood = await foodCollection.find({ userEmail: email, query, role: 'Chef', })
        if (!existingFood) { return res.status(403).send({ message: 'Unauthorized access' }); }
        const updateDoc = {
          $set: {
            foodName: mealInfo.foodName,
            chefName: mealInfo.chef,
            foodImage: mealInfo.foodImage,
            price: mealInfo.foodPrice,
            rating: mealInfo.rating,
            ingredients: mealInfo.ingredients,
            estimatedDeliveryTime: mealInfo.deliveryTime,
            chefExperience: mealInfo.chefExperience,
            updatedAt: new Date()
          }
        };
        const result = await foodCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    app.delete('/meals/:id', verifyAuthToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded_Email;
      const existingMeal = await foodCollection.find({
        userEmail: email,
        _id: new ObjectId(id),
        role: 'Chef',
      })
      if (!existingMeal) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      const query = { _id: new ObjectId(id) };
      const result = await foodCollection.deleteOne(query);
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