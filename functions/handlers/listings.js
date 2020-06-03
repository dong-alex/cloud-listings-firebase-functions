const { db } = require("../utils/admin");

exports.getUserListings = async (req, res) => {
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
};

exports.refreshUserListings = async (req, res) => {
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
};
