const functions = require("firebase-functions");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
const firebase = require("firebase");
const config = require("./config");
const serviceAccount = require("./serviceAccountKey.json");
const cors = require("cors");
const express = require("express");
const app = express();

app.use(cors());

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: "https://cloud-listings.firebaseio.com",
});
firebase.initializeApp(config);

let db = admin.firestore();

const scrapeListings = async (watchlist, userId) => {
	// grab all the listings based on the url
	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	const page = await browser.newPage();
	const allResults = {};
	let batch = db.batch();

	/* eslint-disable no-await-in-loop */
	for (let i = 0; i < watchlist.length; i++) {
		const { id, url } = watchlist[i];

		if (!url) {
			throw new Error(
				"Unable to process request. Please check your parameters and try again."
			);
		}

		console.log(`Scraping ${url}`);
		await page.goto(url);
		let carListings;
		try {
			carListings = await page.evaluate(() => {
				// returns in ms to be converted later on on creation with firebase time stamps
				// ms is in UTC - converted on browser based on locale
				const timeParser = (string) => {
					const dateString = string.split(" ");
					const n = dateString.length;
					const lessThanADayAgo =
						dateString[n - 1].toLowerCase() === "ago";
					let time = "";

					if (lessThanADayAgo) {
						time = dateString.slice(-4);

						const isMinute =
							dateString[n - 2].toLowerCase() === "minutes" ||
							dateString[n - 2].toLowerCase() === "minute";

						const timeAmount = parseInt(dateString[n - 3]);

						// calculate the ms from the time either minutes or hours
						// 1 minute : 60000 ms | 1 hour : 3600000 ms
						const totalMs =
							timeAmount * (isMinute ? 60000 : 3600000);
						const currentDate = new Date();
						time = currentDate.getTime() - totalMs;
					} else {
						time = dateString[n - 1].split("/");

						const day = time[0];
						const month = time[1];
						const year = time[2];

						time = new Date(`${year}-${month}-${day}`).getTime();
					}
					return time;
				};

				const locationParser = (string) => {
					const locationString = string.split(" ");
					const n = locationString.length;
					const lessThanADayAgo =
						locationString[n - 1].toLowerCase() === "ago";
					const isNewCar =
						locationString.slice(0, 2).join(" ") === "NEW CAR";

					let location = "";
					if (isNewCar) {
						if (lessThanADayAgo) {
							location = locationString.slice(2, -4).join(" ");
						} else {
							location = locationString.slice(2, -1).join(" ");
						}
					} else {
						if (lessThanADayAgo) {
							location = locationString.slice(0, -4).join(" ");
						} else {
							location = locationString.slice(0, -1).join(" ");
						}
					}
					return location;
				};

				const results = [];
				const listings = document.querySelectorAll("div.search-item");
				const textContent = (elem) =>
					elem
						? elem.textContent
								.trim()
								.replace(/  +/g, " ")
								.replace(/\n\s*\n\s*\n/g, "")
								.replace("\n", "")
						: "";

				listings.forEach((listing) => {
					const details = textContent(
						listing.querySelector("div.location")
					);
					const validImage = listing
						.querySelector("div.image img")
						.getAttribute("src");
					const location = locationParser(details);
					const time = timeParser(details);

					results.push({
						id: listing.getAttribute("data-listing-id"),
						directUrl: `https://www.kijiji.com${listing
							.querySelector("a.title")
							.getAttribute("href")}`,
						price: textContent(listing.querySelector("div.price")),
						title: textContent(listing.querySelector("a.title")),
						distance: textContent(
							listing.querySelector("div.distance")
						),
						location: location,
						postedAt: time,
						imageUrl: validImage,
						description: textContent(
							listing.querySelector("div.description")
						),
						details: textContent(
							listing.querySelector("div.details")
						),
					});
				});
				return results;
			});
		} catch (err) {
			console.log("Error within the page evaluation");
		}

		const listingRef = db.collection("listings");
		// for every car listing add it into the database - use kijiji listing id to replace as needed
		carListings.forEach((listing) => {
			const { id: listingId, ...rest } = listing;

			batch.set(
				listingRef.doc(listingId),
				{
					...rest,
					watchlistId: id,
					userId,
				},
				{ merge: true }
			);
		});

		// return the list to the caller
		allResults[id] = carListings;
		console.log(`Completed scraping ${url}`);
	}
	/* eslint-enable no-await-in-loop */
	await browser.close();

	// return the results but also store it into the database
	console.log("Attempting to batch writes");
	return batch.commit().then(() => {
		return allResults;
	});
};

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
				message:
					"There was an error grabbing your listings. Please try again.",
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
				message:
					"Email is already in use. Please enter a different email",
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
				message:
					"There was an issue with logging out. Please try again.",
			});
		});
});
// if you add a watchlist item - then automatically query for the front page listings
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
			console.log(
				"Succesfully obtained listings for the new watchlist item"
			);
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
			console.log(
				"There was an error deleting the user. Please try again."
			);
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
