const functions = require("firebase-functions");
<<<<<<< HEAD
=======
const FBAuth = require("./utils/fbAuth");
>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
const cors = require("cors");
const { firebase, db, admin } = require("./utils/admin");

const express = require("express");
const scrapeListings = require("./utils/scrapper");
const deleteQueryBatch = require("./utils/deleteQueryBatch");
const { db, admin } = require("./utils/admin");
const { login, signup, logout } = require("./handlers/user");
const { getUserListings, refreshUserListings } = require("./handlers/listings");
const {
  getUserWatchlistItems,
  deleteUserWatchlistItem,
  addUserWatchlistItem,
} = require("./handlers/watchlist");

const app = express();
app.use(cors());

<<<<<<< HEAD
const FBAuth = async (req, res, next) => {
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    console.log(req.headers.authorization.split("Bearer ")[1]);
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.log("No token found");
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    req.user = await admin.auth().verifyIdToken(idToken);
    const userHandle = await db
      .collection("users")
      .where("userId", "==", req.user.uid)
      .limit(1)
      .get();

    req.user.handle = userHandle.docs[0].data().handle;
    return next();
  } catch (err) {
    console.error("Error verifying token", err);
    return res.status(403).json({ message: "Error verifying token." });
  }
};

app.delete("/watchlist/:watchlistId", async (req, res) => {
  const watchlistId = req.params.watchlistId;

  try {
    await db.collection("watchlist").doc(watchlistId).delete();
    return res
      .status(200)
      .send(
        "Your watchlist item has been deleted. As well, all listings associated with it."
      );
  } catch (err) {
    return res
      .status(400)
      .send(
        "There was an error deleting your watchlist item. Please try agian."
      );
  }
});

// get all listings for the user (TBA)
app.get("/listings", FBAuth, async (req, res) => {
  const userId = req.user.uid;
  console.log("Grabbing all listings");
  return db
    .collection("listings")
    .where("userId", "==", userId)
    .orderBy("postedAt", "desc")
    .get()
    .then((documents) => {
      const data = [];
      documents.forEach((doc) => {
        data.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      res.status(200).json(data);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({
        error: err.code,
        message: "There was an error grabbing your listings. Please try again.",
      });
    });
});

// get all watchlist items for the user (TBA)
app.get("/watchlist", async (req, res) => {
  console.log("Grabbing all watchlist items");
  return db
    .collection("watchlist")
    .get()
    .then((documents) => {
      const data = [];
      documents.forEach((doc) => {
        data.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      res.status(200).json(data);
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({
        error: err.code,
        message:
          "There was an error grabbing your watchlist. Please try again.",
      });
    });
});

// manual refresh of the listings
app.get("/refreshListings", FBAuth, async (req, res) => {
  const userId = req.user.uid;
  const urlData = [];
  db.collection("watchlist")
    .get()
    .then((documentSet) => {
      // if there is nothing in the watchlist collection or no collection - return error
      if (!documentSet) {
        res.status(200).send("No watchlist is being used right now.");
      }

      documentSet.forEach((doc) => {
        const data = doc.data();
        urlData.push({ id: doc.id, ...data });
      });
    })
    .catch((err) => console.log("Error", err));

  try {
    const listings = await scrapeListings(urlData, userId);
    return res.status(200).send(listings);
  } catch (err) {
    return res.status(500).send(err);
  }
});

// add a watchlist item
app.post("/watchlist", FBAuth, async (req, res) => {
  const userId = req.user.uid;
  const url = req.body.url;
  const tagName = req.body.tagName;
  const data = {
    userId,
    url,
    tagName,
  };

  return db
    .collection("watchlist")
    .doc()
    .set(data)
    .then(() => {
      return res.status(200).send(data);
    })
    .catch((err) => {
      console.log("Error creating a new watchlist item");
      return res.status(400).send(err);
    });
});

app.post("/signup", async (req, res) => {
  const { email, password, handle } = req.body;

  let userId;

  const document = await db.collection("users").doc(handle).get();

  // handle taken - try again
  if (document.exists) {
    res.status(400).json({ message: "This email has already been taken" });
  }

  try {
    console.log("Attempting to create user", email);
    const userRecord = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    console.log("Created user");

    userId = userRecord.user.uid;
    token = await userRecord.user.getIdToken();

    const credentials = {
      userId,
      handle,
      email,
      createdAt: new Date().toISOString(),
    };

    await db.collection("users").doc(handle).set(credentials);
    console.log("Succesfully added new user", userId);
    return res
      .status(201)
      .json({ message: "Successfully added new user.", token });
  } catch (err) {
    console.log(err);
    if (err.code === "auth/email-already-in-use") {
      return res.status(400).json({
        message: "Email is already in use. Please enter a different email",
      });
    }

    return res.status(500).json({
      error: err.code,
      message: "Error creating new user. Please try again.",
    });
  }
});

// retrieve the token used given the email and password used.
app.get("/login", async (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  // validate the input first - also include it into the security rules

  try {
    console.log("Attempting to login");
    const data = await firebase
      .auth()
      .signInWithEmailAndPassword(user.email, user.password);

    console.log("Signin succesful - Extracting token");
    // get the token for the certain user
    const token = await data.user.getIdToken();
    return res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    // auth/wrong-password
    // auth/user-not-user
    return res
      .status(403)
      .json({ message: "Incorrect credentials. Please try again." });
  }
});

// logout the user
app.get("/logout", async (req, res) => {
  firebase
    .auth()
    .signOut.then(() => {
      console.log("User has logged out");
      return res
        .status(200)
        .json({ message: "Succesfully logged out of the system." });
    })
    .catch((err) => {
      console.log(err);
      return res.status(400).json({
        message: "There was an issue with logging out. Please try again.",
      });
    });
});
// if you add a watchlist item - then automatically query for the front page listings
=======
// listing items
app.get("/listings", FBAuth, getUserListings);
app.get("/refreshListings", FBAuth, refreshUserListings);

// watchlist items
app.delete("/watchlist/:watchlistId", FBAuth, deleteUserWatchlistItem);
app.get("/watchlist", FBAuth, getUserWatchlistItems);
app.post("/watchlist", FBAuth, addUserWatchlistItem);

// users
app.post("/signup", signup);
app.get("/login", login);
app.get("/logout", logout);

>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
exports.fetchListings = functions.firestore
  .document("watchlist/{watchlistId}")
  .onCreate(async (snapshot, context) => {
    const snapData = snapshot.data();
    const id = context.params.watchlistId;

    const { userId, url } = snapData;
    console.log("Detected a new watchlist ID", id, userId);
    const data = [{ id, url }];

    try {
      await scrapeListings(data, userId);
<<<<<<< HEAD
      console.log("Succesfully obtained listings for the new watchlist item");
=======
      console.log(
        "Succesfully obtained listings for the new watchlist item"
      );
>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
      return;
    } catch (err) {
      console.log("There is an error in the fetchListings listener");
      return;
    }
  });

// if you delete a watchlist document - delete all listings that were connected to it
exports.deleteRelatedListings = functions.firestore
  .document("watchlist/{watchlistId}")
  .onDelete(async (snapshot, context) => {
    const watchlistId = context.params.watchlistId;
    const BATCH_SIZE = 10;

    const query = db
      .collection("listings")
      .where("watchlistId", "==", watchlistId)
      .limit(BATCH_SIZE);

    try {
      await new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, reject);
      });
      return;
    } catch (err) {
      return;
    }
  });

exports.deleteRecords = functions.firestore
  .document("users/{userId}")
  .onDelete(async (snapshot, context) => {
    // delete from the project and the table
    const userId = snapshot.data().userId;
    const BATCH_SIZE = 10;

    try {
      await admin.auth().deleteUser(userId);
    } catch (err) {
<<<<<<< HEAD
      console.log("There was an error deleting the user. Please try again.");
=======
      console.log(
        "There was an error deleting the user. Please try again."
      );
>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
      console.log(err);
      return;
    }

    const query = db
      .collection("watchlist")
      .where("userId", "==", userId)
      .limit(BATCH_SIZE);

    try {
      await new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, reject);
      });
      return;
    } catch (err) {
      return;
    }
  });

// handle post-creation for all new listings with a firebase timestamp of when it was posted
exports.createFirestoreTimestamp = functions.firestore
  .document("listings/{listingId}")
  .onCreate(async (snapshot, context) => {
    console.log("Adding timestamp for", context.params.listingId);
    // replace time posted at with a timestamp to store into firestore
    const timeMs = snapshot.data().postedAt;
    return snapshot.ref
      .set(
        {
          postedAt: admin.firestore.Timestamp.fromMillis(timeMs),
        },
        { merge: true }
      )
      .catch((err) => {
        console.log(err);
        return false;
      });
  });

// an admin function to call - requires authentication of the admin
exports.deleteAllListings = functions
  .runWith({ timeoutSeconds: 60, memory: "1GB" })
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    const BATCH_SIZE = 10;

    let collectionRef = db.collection("listings");
    let query = collectionRef.orderBy("postedAt").limit(BATCH_SIZE);

    try {
      await new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, reject);
      });
      return res.status(200).send("All listings are deleted");
    } catch (err) {
      return res.status(400).send("There was an error with the deletion");
    }
  });
<<<<<<< HEAD

const deleteQueryBatch = (query, resolve, reject) => {
  query
    .get()
    .then((snapshot) => {
      if (snapshot.size === 0) {
        return 0;
      }

      // Delete documents in a batch
      let batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then((numDeleted) => {
      if (numDeleted === 0) {
        resolve();
        return;
      }

      // Recurse on the next process tick, to avoid
      // exploding the stack.
      process.nextTick(() => {
        deleteQueryBatch(query, resolve, reject);
      });
    })
    .catch(reject);
};
=======
>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60

exports.api = functions.region("us-central1").https.onRequest(app);

// TODO - updating a tagName = all listings with the watchlist Id updates the field
// TODO - updating a url = all listings with the url gets deleted and refreshed

// Scalability very low - consider if the costs are minimal
// cron job to be used
// exports.monitorListings = functions
// 	.runWith({ timeoutSeconds: 120, memory: "1GB" })
// 	.region("us-central1")
// 	.pubsub.schedule("every 2 hours")
// 	.onRun(async (context) => {
// 		const urlData = [];
// 		db.collection("watchlist")
// 			.get()
// 			.then((documentSet) => {
// 				// if there is nothing in the watchlist collection or no collection - return success
// 				// next job will try to have something in the watchlist
// 				if (!documentSet) {
// 					res.status(200).send("Success! No watchlist to go through");
// 				}

// 				documentSet.forEach((doc) => {
// 					const data = doc.data();
// 					urlData.push({ id: doc.id, ...data });
// 				});
// 			})
// 			.catch((err) => console.log("Error", err));

// 		try {
// 			await scrapeListings(urlData);
// 			return;
// 		} catch (err) {
// 			console.log(err);
// 			return;
// 		}
// 	});
