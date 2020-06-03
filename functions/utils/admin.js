const admin = require("firebase-admin");
const firebase = require("firebase");
const config = require("./config");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://cloud-listings.firebaseio.com",
});
firebase.initializeApp(config);

let db = admin.firestore();

module.exports = { firebase, db, admin };
