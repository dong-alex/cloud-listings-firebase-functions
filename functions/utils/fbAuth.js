const { db } = require("../utils/admin");

exports.FBAuth = async (req, res, next) => {
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
