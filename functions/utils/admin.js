let admin = require("firebase-admin");
let firebase = require("firebase");
let config = require("./config");
let serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://cloud-listings.firebaseio.com",
});

firebase.initializeApp(config);

let db = admin.firestore();

module.exports = { firebase, db, admin };
