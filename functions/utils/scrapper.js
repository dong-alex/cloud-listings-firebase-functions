const puppeteer = require("puppeteer");
const { db } = require("./admin");

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
					const lessThanADayAgo = dateString[n - 1].toLowerCase() === "ago";
					let time = "";

					if (lessThanADayAgo) {
						time = dateString.slice(-4);

						const isMinute =
							dateString[n - 2].toLowerCase() === "minutes" ||
							dateString[n - 2].toLowerCase() === "minute";

						const timeAmount = parseInt(dateString[n - 3]);

						// calculate the ms from the time either minutes or hours
						// 1 minute : 60000 ms | 1 hour : 3600000 ms
						const totalMs = timeAmount * (isMinute ? 60000 : 3600000);
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
					const lessThanADayAgo = locationString[n - 1].toLowerCase() === "ago";
					const isNewCar = locationString.slice(0, 2).join(" ") === "NEW CAR";

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
					const details = textContent(listing.querySelector("div.location"));
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
						distance: textContent(listing.querySelector("div.distance")),
						location: location,
						postedAt: time,
						imageUrl: validImage,
						description: textContent(listing.querySelector("div.description")),
						details: textContent(listing.querySelector("div.details")),
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
	try {
		await batch.commit();
	} catch (err) {
		console.log("Error in the batch commit")
		console.log(err);
	}
	return allResults;
};

module.exports = scrapeListings;
