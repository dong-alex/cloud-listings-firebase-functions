<<<<<<< HEAD
const admin = require("firebase-admin");
const firebase = require("firebase");
const config = require("./config");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://cloud-listings.firebaseio.com",
});
=======
const firebase = require("firebase");
const serviceAccount = require("./serviceAccountKey.json");
const admin = require("firebase-admin");
const config = require("./config");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cloud-listings.firebaseio.com",
});

>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
firebase.initializeApp(config);

let db = admin.firestore();

<<<<<<< HEAD
module.exports = { firebase, db, admin };
=======
module.exports = { admin, firebase, db };
>>>>>>> 3344e1612a233abbdc011cf38a2d28732c9b8b60
