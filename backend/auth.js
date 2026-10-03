const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "pulseapi_jwt_super_secret_key_2026";
const JWT_EXPIRES_IN = "7d";

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name || user.fullName || user.username,
    role: user.role || "developer",
    avatarSeed: user.avatar_seed || user.username,
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
      role: user.role || "developer",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

const findUserByEmailStmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
const findUserByUsernameStmt = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)");
const findUserByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");

const insertUserStmt = db.prepare(`
  INSERT INTO users (username, email, password_hash, full_name, role, avatar_seed)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateProfileStmt = db.prepare(`
  UPDATE users 
  SET full_name = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updatePasswordStmt = db.prepare(`
  UPDATE users 
  SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
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
  const avatarSeed = cleanUsername;

  const result = insertUserStmt.run(
    cleanUsername,
    cleanEmail,
    passwordHash,
    cleanFullName,
    "developer",
    avatarSeed
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

function getUserById(id) {
  const user = findUserByIdStmt.get(id);
  return sanitizeUser(user);
}

async function updateUserProfile(id, { fullName, currentPassword, newPassword }) {
  const user = findUserByIdStmt.get(id);
  if (!user) {
    throw new Error("User not found");
  }

  if (fullName && typeof fullName === "string") {
    updateProfileStmt.run(fullName.trim(), id);
  }

  if (newPassword) {
    if (!currentPassword) {
      throw new Error("Current password is required to change password");
    }
    const isMatch = await comparePassword(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error("Current password is incorrect");
    }
    if (newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long");
    }
    const newHash = await hashPassword(newPassword);
    updatePasswordStmt.run(newHash, id);
  }

  const updatedUser = findUserByIdStmt.get(id);
  return sanitizeUser(updatedUser);
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

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && decoded?.id) {
      const user = findUserByIdStmt.get(decoded.id);
      if (user) {
        req.user = sanitizeUser(user);
      }
    }
    next();
  });
}

module.exports = {
  JWT_SECRET,
  hashPassword,
  comparePassword,
  generateToken,
  sanitizeUser,
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
  authenticateToken,
  optionalAuth,
};
