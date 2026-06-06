const express = require('express');
const path = require('path');
const { startRelay } = require('./wsRelay');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

startRelay(3001);
