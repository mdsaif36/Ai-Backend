import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js"; // Ensure .js extension if using ES Modules

const signup = async (req, res, next) => {
  console.log("1. Signup process started with request body:", req.body);
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    console.error("Validation failed: Missing fields.");
    return res.status(400).json({ message: "Please enter all fields" });
  }

  try {
    console.log("2. Attempting to get database connection...");
    const connection = await pool.getConnection();
    console.log("3. Database connection successful.");

    console.log(
      `4. Checking if user with email '${email}' or username '${username}' already exists...`
    );
    const [existingUser] = await connection.query(
      "SELECT * FROM Users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existingUser.length > 0) {
      console.error("Conflict: User already exists.");
      connection.release();
      return res.status(400).json({ message: "User already exists" });
    }
    console.log("5. User does not exist. Proceeding to hash password.");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log("6. Password hashed successfully.");

    console.log("7. Inserting new user into the database...");
    const [result] = await connection.query(
      "INSERT INTO Users (email, username, password) VALUES (?, ?, ?)",
      [email, username, hashedPassword]
    );
    console.log("8. User inserted successfully. Insert ID:", result.insertId);

    const userId = result.insertId;
    connection.release();

    if (!process.env.JWT_SECRET) {
      // This is a critical server configuration error.
      console.error("FATAL: JWT_SECRET is not defined in the .env file.");
      throw new Error("JWT_SECRET is not configured on the server.");
    }

    console.log("9. Creating JWT token...");
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    console.log("10. Token created. Sending successful response.");

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        username,
      },
    });
  } catch (error) {
    console.error("--- AN ERROR OCCURRED DURING SIGNUP ---");
    // This will print the detailed error in your server console.
    next(error);
  }
};

const signin = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Please enter all fields" });
  }

  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      "SELECT * FROM Users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      connection.release();
      return res.status(400).json({ message: "Invalid credentials" });
    }

    connection.release();

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.status(200).json({
      token,
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (error) {
    next(error);
  }
};

export { signup, signin };
