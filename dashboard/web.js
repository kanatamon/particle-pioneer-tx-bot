const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Variables to store data
let userList = ['Alice', 'Bob'];
let userTxCounts = {
  Alice: 0,
  Bob: 0,
};

// Route to handle POST requests for user list
app.post('/user/list', (req, res) => {
  const users = req.body.users;
  userList = users;
  userTxCounts = Object.fromEntries(users.map((user) => [user, 0]));
  res.send({});
});

// Route to handle POST requests for user scores
app.post('/user/tx-count', (req, res) => {
  const { user, txCount } = req.body;
  userTxCounts[user] = txCount;
  res.send({});
});

// Route to serve the HTML file with JavaScript for displaying data
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Route to serve user list and scores as JSON
app.get('/data', (req, res) => {
  res.json({
    userList: userList,
    userTxCounts: userTxCounts,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
