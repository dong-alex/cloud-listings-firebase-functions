const { firebase, admin, db } = require("../utils/admin");

exports.signup = async (req, res) => {
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
};

exports.login = async (req, res) => {
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
};

exports.logout = async (req, res) => {
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
};
