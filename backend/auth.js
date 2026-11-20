const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is required and must contain at least 32 characters"
  );
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "30d";

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name || user.fullName || user.username,
    createdAt: user.created_at || user.createdAt,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

const findUserByEmailStmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
const findUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)");
const findUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");

const insertUserStmt = db.prepare(`
  INSERT INTO users (username, email, password_hash, full_name)
  VALUES (?, ?, ?, ?)
`);

async function registerUser({ username, email, password, fullName }) {
  if (!username || typeof username !== "string" || username.trim().length < 3) {
    throw new Error("Username must be at least 3 characters long");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error("A valid email address is required");
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanFullName = (fullName && fullName.trim()) || cleanUsername;

  const existingEmail = findUserByEmailStmt.get(cleanEmail);
  if (existingEmail) {
    throw new Error("An account with this email already exists");
  }

  const existingUsername = findUserByUsernameStmt.get(cleanUsername);
  if (existingUsername) {
    throw new Error("Username is already taken");
  }

  const passwordHash = await hashPassword(password);

  const result = insertUserStmt.run(
    cleanUsername,
    cleanEmail,
    passwordHash,
    cleanFullName
  );

  const createdUser = findUserByIdStmt.get(result.lastInsertRowid);
  const token = generateToken(createdUser);

  return {
    user: sanitizeUser(createdUser),
    token,
  };
}

async function loginUser({ identifier, password }) {
  if (!identifier || !password) {
    throw new Error("Email/username and password are required");
  }

  const cleanIdentifier = identifier.trim();
  let user = null;

  if (cleanIdentifier.includes("@")) {
    user = findUserByEmailStmt.get(cleanIdentifier.toLowerCase());
  } else {
    user = findUserByUsernameStmt.get(cleanIdentifier);
  }

  if (!user) {
    throw new Error("Invalid username/email or password");
  }

  const isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch) {
    throw new Error("Invalid username/email or password");
  }

  const token = generateToken(user);
  return {
    user: sanitizeUser(user),
    token,
  };
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: "Invalid or expired token" });
    }
    const user = findUserByIdStmt.get(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User account no longer exists" });
    }
    req.user = sanitizeUser(user);
    next();
  });
}

module.exports = {
  registerUser,
  loginUser,
  authenticateToken,
};
