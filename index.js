const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const { cookie } = require("express-validator");
// const { decode } = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

var admin = require("firebase-admin");
 const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT,'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const logger = (req, res, next) => {
  console.log("inside the logger in the middleware");
  next();
};

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log("cookie in the middleware", token);

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.decoded = decoded;

    next();
  });

  //
};

const verifyFirebaseToken = async (req, res, next) => {
  console.log("in the firebase token verification");
  const authHeader = req.headers?.authorization;

  console.log(authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  console.log("token is", token);

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyTokenEmail = (req, res, next) => {
  if (req.decoded.email !== req.query.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.e4khssl.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("Career_code").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    const jobCollection = client.db("Career_code").collection("Jobs");
    const ApplicationCollection = client
      .db("Career_code")
      .collection("Applications");

    // jwt token related api

    app.post("/jwt", (req, res) => {
      const userData = req.body;
      const token = jwt.sign(userData, process.env.JWT_ACCESS_SECRET, {
        expiresIn: "1h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: false,
      });

      res.send(token);
    });

    app.get("/jobs", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.hr_email = email;
      }
      const cursor = jobCollection.find(query);
      const result = await cursor.toArray();
      // console.log(result);
      res.send(result);
    });

    app.get(
      "/jobs/applications",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;

        const query = { hr_email: email };
        const jobs = await jobCollection.find(query).toArray();

        for (const job of jobs) {
          const applicationQuery = { JobId: job._id.toString() };
          const app_count =
            await ApplicationCollection.countDocuments(applicationQuery);
          job.applicationCount = app_count;
        }
        res.send(jobs);
      },
    );

    app.post("/jobs", async (req, res) => {
      const data = req.body;
      const result = await jobCollection.insertOne(data);
      res.send(result);
    });

    // app.get('/jobsByEmailAddress',async(req,res)=>{
    //   const email=req.query.email;
    //   const query={hr_email:email};
    //   const result=await jobCollection.find(query);
    //   res.send(result);

    // })

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await jobCollection.findOne(query);
      res.send(result);
    });

    // application related apies

    app.get("/applications/job/:job_id", async (req, res) => {
      const job_id = req.params.job_id;
      const query = { JobId: job_id };
      const result = await ApplicationCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/applications/:id", async (req, res) => {
      const updated = req.body;
      // console.log(updated);
      const filter = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          status: req.body.status,
        },
      };
      const result = await ApplicationCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post("/applications", async (req, res) => {
      const application = req.body;
      // console.log(application);

      const result = await ApplicationCollection.insertOne(application);
      res.send(result);
    });

    app.get(
      "/applications",
      logger,
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;

        // console.log(email,req.decoded.email);

        // if(email!==req.decoded.email){
        //   return res.status(403).send({message: 'forbidden access'});
        // }

        const query = {
          applicant: email,
        };
        // console.log("inside the application api", req.cookies);
        const result = await ApplicationCollection.find(query).toArray();

        for (const application of result) {
          const JobId = application.JobId;
          const jobQuery = { _id: new ObjectId(JobId) };
          const job = await jobCollection.findOne(jobQuery);
          application.company = job.company;
          application.title = job.title;
          application.company_logo = job.company_logo;
        }
        res.send(result);
      },
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
