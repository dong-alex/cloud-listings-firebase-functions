exports.deleteUserWatchlistItem = async (req, res) => {
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
};

exports.getUserWatchlistItems = async (req, res) => {
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
};

exports.addUserWatchlistItem = async (req, res) => {
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
};
