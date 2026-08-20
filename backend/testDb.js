const db = require('./db');

console.log("Database file created and tables set up.");

const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', table);